#!/usr/bin/env python3
"""Loopback PR dashboard. Python 3 + authenticated gh CLI."""
import argparse, concurrent.futures, json, mimetypes, os, pathlib, re, subprocess, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
ROOT=pathlib.Path(__file__).parent
REPOS=[]
AUTHOR=None
INTERVAL=60
REVIEW_LABELS={}
WATCH_DEPLOYMENTS={}
WATCH_SCHEDULED_WORKFLOWS={}
def configure():
 global REPOS, AUTHOR, PORT, INTERVAL, REVIEW_LABELS, WATCH_DEPLOYMENTS, WATCH_SCHEDULED_WORKFLOWS
 parser=argparse.ArgumentParser(description='Local GitHub PR dashboard. Requires gh auth login.')
 parser.add_argument('--repo',action='append',help='owner/repository; repeat to restrict auto-discovery')
 parser.add_argument('--author',help='GitHub login; defaults to the authenticated user')
 parser.add_argument('--config',default=str(ROOT/'config.json'))
 parser.add_argument('--port',type=int,default=int(os.environ.get('PORT','8765')))
 args=parser.parse_args()
 path=pathlib.Path(args.config)
 try:
  config=json.loads(path.read_text()) if path.exists() else {}
  REPOS=list(dict.fromkeys(args.repo or config.get('repos',[])))
  if any(not isinstance(r,str) or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',r) for r in REPOS):
   parser.error('repos must use the owner/name format')
  AUTHOR=args.author or config.get('author') or None
  if AUTHOR and not re.fullmatch(r'[A-Za-z0-9-]+',AUTHOR): parser.error('author must be a GitHub login')
  INTERVAL=int(config.get('refresh_seconds',60))
  if INTERVAL<30: parser.error('refresh_seconds must be at least 30')
  PORT=args.port
  if not 1<=PORT<=65535: parser.error('port must be between 1 and 65535')
  REVIEW_LABELS=config.get('review_labels',{})
  if not isinstance(REVIEW_LABELS,dict) or any(not isinstance(v,dict) or any(not isinstance(k,str) or not isinstance(label,str) for k,label in v.items()) for v in REVIEW_LABELS.values()):
   parser.error('review_labels must map repositories to team-slug/label objects')
  WATCH_DEPLOYMENTS=config.get('watch_deployments',{})
  if not isinstance(WATCH_DEPLOYMENTS,dict) or any(not isinstance(v,list) or any(not isinstance(e,str) for e in v) for v in WATCH_DEPLOYMENTS.values()):
   parser.error('watch_deployments must map repositories to lists of environment names')
  WATCH_SCHEDULED_WORKFLOWS=config.get('watch_scheduled_workflows',{})
  if not isinstance(WATCH_SCHEDULED_WORKFLOWS,dict) or any(not isinstance(v,list) or any(not isinstance(w,str) or not re.fullmatch(r'[A-Za-z0-9_.-]+\.ya?ml',w) for w in v) for v in WATCH_SCHEDULED_WORKFLOWS.values()):
   parser.error('watch_scheduled_workflows must map repositories to lists of workflow file names')
 except (ValueError,TypeError,OSError) as e: parser.error(str(e))
PORT=int(os.environ.get('PORT','8765'))
CACHE={'data':None,'error':None,'refreshing':False,'rateLimitedUntil':None}
LOCK=threading.Lock()
# Set by any GitHub call that hits a rate limit during the current refresh.
RATE_LIMITED=threading.Event()
# Ready-for-review lists, default-branch audits and discovery change slowly; refresh them less often.
SLOW_SECONDS=900
LAST_FULL=0
BACKOFF=0
def note_rate_limit(message):
 if 'rate limit' in message.lower() or 'RATE_LIMIT' in message: RATE_LIMITED.set()
def run(args,cwd=None):
 p=subprocess.run(args,cwd=cwd,capture_output=True,text=True,timeout=90)
 if p.returncode:
  note_rate_limit(p.stderr)
  raise RuntimeError(p.stderr.strip()[:500] or 'Command failed')
 return p.stdout.strip()
def gh(*args): return json.loads(run(['gh',*args]))
def graph(query,**variables):
 args=['api','graphql','-f','query='+query]
 for k,v in variables.items(): args+=['-F',f'{k}={v}']
 x=gh(*args)
 if x.get('errors'):
  note_rate_limit(str(x['errors']))
  raise RuntimeError(str(x['errors']))
 return x['data']
def discussion(repo,number):
 owner,name=repo.split('/')
 threads=[]; cursor=None
 while True:
  field='after:'+json.dumps(cursor)+',' if cursor else ''
  q='query { repository(owner:'+json.dumps(owner)+',name:'+json.dumps(name)+') { pullRequest(number:'+str(number)+') { reviewThreads(first:100,'+field+') { pageInfo { hasNextPage endCursor } nodes { isResolved isOutdated path line comments(first:1) { nodes { body url author { login __typename } } } } } } } }'
  c=graph(q)['repository']['pullRequest']['reviewThreads']; threads+=c['nodes']
  if not c['pageInfo']['hasNextPage']: break
  cursor=c['pageInfo']['endCursor']
 return threads
def check_state(c):
 value=(c.get('conclusion') or c.get('state') or '').upper()
 if value in ('FAILURE','ERROR','TIMED_OUT','CANCELLED','ACTION_REQUIRED','STARTUP_FAILURE','STALE'):
  name=' '.join(str(c.get(k) or '') for k in ('name','context','workflowName'))
  return 'advisory' if re.search(r'\b(?:pnpm|npm)\s+audit\b',name,re.I) else 'failed'
 if c.get('status')=='WAITING': return 'waiting'
 if c.get('status') and c['status']!='COMPLETED' or value in ('PENDING','EXPECTED'): return 'pending'
 if value=='SUCCESS': return 'passed'
 if value in ('NEUTRAL','SKIPPED'): return 'neutral'
 return 'unknown'
def retry_job_id(repo,check):
 if check.get('status')!='COMPLETED' or check_state(check) not in ('failed','advisory'): return None
 match=re.fullmatch(r'https://github\.com/'+re.escape(repo)+r'/actions/runs/[0-9]+/job/([0-9]+)(?:\?[^#]*)?',check.get('detailsUrl') or '')
 return match.group(1) if match else None

def retry_check(repo,number,job_id):
 if not isinstance(repo,str) or type(number) is not int or not isinstance(job_id,str):
  raise ValueError('Invalid retry request')
 with LOCK:
  prs=[p for r in (CACHE.get('data') or {}).get('repositories',[]) if r['name']==repo for p in r['prs']+r.get('reviews',[])+r.get('ready',[]) if p['number']==number]
  eligible=any(retry_job_id(repo,c)==job_id for p in prs for c in p['checks'])
 if not eligible: raise ValueError('Check is unavailable or cannot be retried. Refresh and try again.')
 run(['gh','api','--method','POST',f'repos/{repo}/actions/jobs/{job_id}/rerun'])

def merge_pull_request(repo,number):
 if not isinstance(repo,str) or type(number) is not int: raise ValueError('Invalid merge request')
 with LOCK:
  prs=[p for r in (CACHE.get('data') or {}).get('repositories',[]) if r['name']==repo for p in r['prs'] if p['number']==number]
 # Only the user's own PRs, and only the commit the dashboard last showed.
 if not prs or not prs[0].get('headRefOid'): raise ValueError('Pull request is unavailable. Refresh and try again.')
 if prs[0].get('isDraft'): raise ValueError('Draft pull requests cannot be merged.')
 allowed=gh('repo','view',repo,'--json','squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed')
 method=next((flag for key,flag in (('mergeCommitAllowed','--merge'),('squashMergeAllowed','--squash'),('rebaseMergeAllowed','--rebase')) if allowed.get(key)),None)
 if not method: raise ValueError('The repository allows no merge method.')
 run(['gh','pr','merge',str(number),'--repo',repo,method,'--match-head-commit',prs[0]['headRefOid']])

def discover_repositories(login,reviewer=False):
 # review-requested also matches requests made to the user's teams.
 who=['--review-requested',login,'--draft=false'] if reviewer else ['--author',login]
 results=gh('search','prs',*who,'--state','open','--limit','1000','--json','repository')
 return sorted({p['repository']['nameWithOwner'] for p in results if p.get('repository',{}).get('nameWithOwner')})
READY_DAYS=7
def list_prs(repo,login,reviewer=False,ready=False):
 fields='author,headRefOid,number,title,headRefName,headRepositoryOwner,headRepository,baseRefName,reviewDecision,statusCheckRollup,isDraft,mergeable,mergeStateStatus,updatedAt,createdAt,url,additions,deletions,changedFiles,reviewRequests,reviews,comments'
 if ready:
  # Other people's recently updated PRs that still need a review and weren't requested from the user.
  since=time.strftime('%Y-%m-%d',time.gmtime(time.time()-READY_DAYS*86400))
  who=['--search',f'draft:false -author:{login} -review-requested:{login} -review:approved updated:>={since}']
 elif reviewer: who=['--search',f'review-requested:{login} draft:false']
 else: who=['--author',login]
 # GraphQL cost follows the number of PRs requested, not returned: --limit 10000 costs 5 points even
 # for one PR. Start small and only ask for more when a page comes back full.
 limit=30 if ready else 20
 while True:
  prs=gh('pr','list','--repo',repo,*who,'--state','open','--limit',str(limit),'--json',fields)
  if ready or len(prs)<limit or limit>=1000: break
  limit*=5
 if ready: prs=[p for p in prs if not (p.get('author') or {}).get('is_bot')]
 return prs

THREAD_FIELDS='isResolved isOutdated path line comments(first:1) { nodes { body url author { login __typename } } }'
def attach_threads(repo,prs):
 """Load review threads for many PRs in one query per 25 PRs instead of one query per PR."""
 owner,name=repo.split('/')
 numbers=sorted({p['number'] for p in prs})
 found={}; errors={}
 for i in range(0,len(numbers),25):
  chunk=numbers[i:i+25]
  fields=' '.join(f'p{n}: pullRequest(number:{n}) {{ reviewThreads(first:100) {{ pageInfo {{ hasNextPage }} nodes {{ {THREAD_FIELDS} }} }} }}' for n in chunk)
  try:
   data=graph('query { repository(owner:'+json.dumps(owner)+',name:'+json.dumps(name)+') { '+fields+' } }')['repository']
   for n in chunk:
    threads=data[f'p{n}']['reviewThreads']
    found[n]=discussion(repo,n) if threads['pageInfo']['hasNextPage'] else threads['nodes']
  except Exception as e:
   for n in chunk: errors[n]=str(e)
 for p in prs:
  p['threads']=found.get(p['number'],[]); p['discussionError']=errors.get(p['number'])

def finish_prs(repo,login,prs,reviewer=False):
 for p in prs:
  p['repo']=repo
  # Being requested again after reviewing means the author wants a re-review.
  if reviewer: p['rereview']=any((r.get('author') or {}).get('login')==login for r in p['reviews'])
  p['reviewLabels']=[REVIEW_LABELS.get(repo,{}).get((r.get('slug') or r.get('name') or '').split('/')[-1],r.get('name') or r.get('slug')) for r in p['reviewRequests'] if r.get('__typename')=='Team']
  p['checks']=[dict(c,category=check_state(c)) for c in p.pop('statusCheckRollup') or []]
  for c in p['checks']: c['retryJobId']=retry_job_id(repo,c)
  p['unresolved']=[t for t in p['threads'] if not t['isResolved']]
  for t in p['unresolved']:
   author=(t['comments']['nodes'][0].get('author') or {}) if t['comments']['nodes'] else {}
   login2=author.get('login','deleted')
   t['kind']='bugbot' if 'bugbot' in login2.lower() or login2.lower() in ('cursor','cursor[bot]') else 'bot' if author.get('__typename')=='Bot' else 'human'
  p['failed']=sum(c['category']=='failed' for c in p['checks'])
  p['advisory']=sum(c['category']=='advisory' for c in p['checks'])
  p['pending']=sum(c['category']=='pending' for c in p['checks'])
 return prs

def collect_repository(repo,login,reviewer=False,ready=False):
 prs=list_prs(repo,login,reviewer=reviewer,ready=ready)
 attach_threads(repo,prs)
 return finish_prs(repo,login,prs,reviewer=reviewer)

def main_branch_audit(repo):
 """Failing audit checks on the default branch's latest commit."""
 owner,name=repo.split('/')
 checks=[]; cursor=None; branch=None
 while True:
  field='after:'+json.dumps(cursor)+',' if cursor else ''
  q='query { repository(owner:'+json.dumps(owner)+',name:'+json.dumps(name)+') { defaultBranchRef { name target { ... on Commit { statusCheckRollup { contexts(first:100,'+field+') { pageInfo { hasNextPage endCursor } nodes { ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } } ... on StatusContext { context state targetUrl } } } } } } } } }'
  ref=graph(q)['repository']['defaultBranchRef']
  rollup=((ref or {}).get('target') or {}).get('statusCheckRollup')
  if not rollup: break
  branch=ref['name']
  for c in rollup['contexts']['nodes']:
   c['workflowName']=(((c.pop('checkSuite',None) or {}).get('workflowRun') or {}).get('workflow') or {}).get('name')
   checks.append(c)
  if not rollup['contexts']['pageInfo']['hasNextPage']: break
  cursor=rollup['contexts']['pageInfo']['endCursor']
 failures=[{'name':c.get('name') or c.get('context'),'url':c.get('detailsUrl') or c.get('targetUrl')} for c in checks if check_state(c)=='advisory']
 return {'branch':branch,'failures':failures}

def collect_all(repo,login,full=True):
 """Own PRs, review requests and, on full refreshes, ready-for-review PRs and the default-branch audit.
 Slow parts are None when skipped so the caller keeps the previous values."""
 prs=list_prs(repo,login)
 reviews=list_prs(repo,login,reviewer=True)
 ready=list_prs(repo,login,ready=True) if full else None
 if ready is not None:
  # The search can't exclude team review requests, so drop PRs already listed as requested.
  requested={p['number'] for p in reviews}
  ready=[p for p in ready if p['number'] not in requested]
 attach_threads(repo,prs+reviews+(ready or []))
 audit=None
 if full:
  try: audit=main_branch_audit(repo)
  except Exception as e: audit={'branch':None,'failures':[],'error':str(e)}
 return finish_prs(repo,login,prs),finish_prs(repo,login,reviews,reviewer=True),ready and finish_prs(repo,login,ready),audit

def deployment_status(repo,environment):
 """Combined state of the latest deployment to an environment (REST, not GraphQL).
 One release deploys several jobs, so all deployments of the newest commit count together."""
 deployments=gh('api',f'repos/{repo}/deployments?environment={environment}&per_page=10')
 if not deployments: return None
 latest=[d for d in deployments if d['sha']==deployments[0]['sha']]
 statuses=[(gh('api',f"repos/{repo}/deployments/{d['id']}/statuses?per_page=1") or [{'state':'pending'}])[0] for d in latest]
 states={s_['state'] for s_ in statuses}
 state=('failed' if states&{'failure','error'} else 'waiting' if 'waiting' in states
        else 'in_progress' if states&{'queued','in_progress','pending'} else 'success')
 run=next((re.sub(r'/job/[0-9]+.*$','',s_.get('log_url') or s_.get('target_url') or '') for s_ in statuses if s_.get('log_url') or s_.get('target_url')),None)
 return {'environment':environment,'state':state,'ref':deployments[0].get('ref'),'url':run,
         'createdAt':deployments[0].get('created_at'),'actor':(deployments[0].get('creator') or {}).get('login'),
         'updatedAt':max((s_.get('created_at') or '' for s_ in statuses),default=None)}

def scheduled_run(repo,workflow):
 """Latest finished scheduled run of a workflow (REST, not GraphQL). Schedules only run on the default branch.
 A run being re-run isn't finished, so its failure gives way to the previous run until the retry ends."""
 runs=gh('api',f'repos/{repo}/actions/workflows/{workflow}/runs?event=schedule&status=completed&per_page=1').get('workflow_runs') or []
 if not runs: return None
 latest=runs[0]
 return {'workflow':workflow,'name':latest.get('name') or workflow,'failed':latest.get('conclusion') in ('failure','timed_out','startup_failure'),
         'branch':latest.get('head_branch'),'url':latest.get('html_url'),'updatedAt':latest.get('updated_at')}

def rate_limit_until():
 """When the paused dashboard should try again: GitHub's reset time, else an increasing backoff."""
 global BACKOFF
 BACKOFF+=1
 try:
  graphql=gh('api','rate_limit')['resources']['graphql']
  if graphql['remaining']==0 and graphql['reset']>time.time(): return graphql['reset']
 except Exception: pass
 return time.time()+min(3600,300*2**(BACKOFF-1))

def refresh(full=False):
 global LAST_FULL, BACKOFF
 with LOCK:
  if CACHE['refreshing']: return
  CACHE['refreshing']=True
 RATE_LIMITED.clear()
 started=time.time()
 try:
  login=AUTHOR or gh('api','user')['login']
  with LOCK: previous=CACHE['data']
  old={r['name']:r for r in (previous or {}).get('repositories',[])} if previous and previous['login']==login else {}
  full=full or not old or started-LAST_FULL>=SLOW_SECONDS
  if REPOS: repos=REPOS
  elif full: repos=sorted(set(discover_repositories(login))|set(discover_repositories(login,reviewer=True)))
  else: repos=sorted(old)
  discovered=set(repos)
  if not REPOS: repos=sorted(discovered | old.keys())
  repositories=[]
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
   futures={repo:pool.submit(collect_all,repo,login,full) for repo in repos}
   by_future={future:repo for repo,future in futures.items()}
   for future in concurrent.futures.as_completed(by_future):
    repo=by_future[future]
    try:
     prs,reviews,ready,audit=future.result()
     if not REPOS and repo not in discovered and not prs and not reviews: continue
     if ready is None:
      requested={p['number'] for p in reviews}
      ready=[p for p in old.get(repo,{}).get('ready',[]) if p['number'] not in requested]
     if audit is None: audit=old.get(repo,{}).get('mainAudit')
     deployments=[]
     for environment in WATCH_DEPLOYMENTS.get(repo,[]):
      try: status=deployment_status(repo,environment)
      except Exception: status=next((d for d in old.get(repo,{}).get('deployments',[]) if d['environment']==environment),None)
      if status: deployments.append(status)
     scheduled=[]
     for workflow in WATCH_SCHEDULED_WORKFLOWS.get(repo,[]):
      try: latest=scheduled_run(repo,workflow)
      except Exception: latest=next((s_ for s_ in old.get(repo,{}).get('scheduledRuns',[]) if s_['workflow']==workflow),None)
      if latest: scheduled.append(latest)
     repositories.append(dict(old.get(repo,{}),name=repo,prs=prs,reviews=reviews,ready=ready,mainAudit=audit,deployments=deployments,scheduledRuns=scheduled,error=None,updatedAt=time.time()))
    except Exception as e: repositories.append(dict(old.get(repo,{'name':repo,'prs':[],'reviews':[],'ready':[],'updatedAt':None}),error=str(e)))
    completed={r['name']:r for r in repositories}
    partial=[completed.get(name,old.get(name,{'name':name,'prs':[],'reviews':[],'ready':[],'error':None,'updatedAt':None})) for name in repos]
    with LOCK: CACHE.update(data={'login':login,'repositories':partial,'updatedAt':time.time()},error=None)
  repositories.sort(key=lambda r:r['name'])
  with LOCK: CACHE.update(data={'login':login,'repositories':repositories,'updatedAt':time.time()},error=None)
  if full and not RATE_LIMITED.is_set(): LAST_FULL=started
 except Exception as e:
  with LOCK: CACHE['error']=str(e)
 finally:
  until=rate_limit_until() if RATE_LIMITED.is_set() else None
  if until is None: BACKOFF=0
  with LOCK: CACHE.update(refreshing=False,rateLimitedUntil=until)

def loop():
 while True:
  refresh()
  # While rate limited, wait for the reset instead of spending the shared budget on failing calls.
  with LOCK: until=CACHE.get('rateLimitedUntil') or 0
  time.sleep(max(INTERVAL,until-time.time()))
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.headers.get('Host') not in (f'127.0.0.1:{PORT}',f'localhost:{PORT}'):
   self.send_error(403); return
  path=urlparse(self.path).path
  if path=='/api/status':
   with LOCK: body=json.dumps(CACHE).encode()
   content='application/json'
  else:
   assets=(ROOT/'dist').resolve()
   file=(assets/('index.html' if path=='/' else path.lstrip('/'))).resolve()
   if assets not in file.parents or not file.is_file():
    self.send_error(404,'Frontend unavailable; run pnpm install and pnpm build' if path=='/' else 'Not found'); return
   body=file.read_bytes()
   content=mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
  self.send_response(200); self.send_header('Content-Type',content+'; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"); self.end_headers(); self.wfile.write(body)
 def do_POST(self):
  if self.path not in ('/api/refresh','/api/checks/retry','/api/pulls/merge') or self.headers.get('Origin') not in (f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}') or self.headers.get('Host') not in (f'127.0.0.1:{PORT}',f'localhost:{PORT}'):
   self.send_error(403);return
  if self.path in ('/api/checks/retry','/api/pulls/merge'):
   try:
    length=int(self.headers.get('Content-Length','0'))
    if not 0<length<=4096: raise ValueError('Invalid request size')
    payload=json.loads(self.rfile.read(length))
    if not isinstance(payload,dict): raise ValueError('Invalid request')
    if self.path=='/api/pulls/merge': merge_pull_request(payload.get('repo'),payload.get('number'))
    else: retry_check(payload.get('repo'),payload.get('number'),payload.get('jobId'))
   except (ValueError,UnicodeDecodeError) as e:
    self.send_json_error(400,str(e));return
   except Exception as e:
    self.send_json_error(502,str(e));return
  # A manual refresh also reloads the slow parts.
  threading.Thread(target=refresh,kwargs={'full':self.path=='/api/refresh'},daemon=True).start(); self.send_response(202);self.end_headers()
 def send_json_error(self,status,message):
  self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers()
  self.wfile.write(json.dumps({'error':message}).encode())
 def log_message(self,*args): pass
if __name__=='__main__':
 configure()
 threading.Thread(target=loop,daemon=True).start()
 print(f'Dashboard listening at http://127.0.0.1:{PORT}',flush=True)
 ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
