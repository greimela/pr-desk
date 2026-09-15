#!/usr/bin/env python3
"""Read-only, loopback PR dashboard. Python 3 + authenticated gh CLI."""
import argparse, concurrent.futures, json, mimetypes, os, pathlib, re, subprocess, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
ROOT=pathlib.Path(__file__).parent
REPOS=[]
AUTHOR=None
INTERVAL=60
REVIEW_LABELS={}
CHECKOUT_PATHS=[]
def configure():
 global REPOS, AUTHOR, PORT, INTERVAL, REVIEW_LABELS, CHECKOUT_PATHS
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
  CHECKOUT_PATHS=config.get('checkout_paths',[])
  if not isinstance(CHECKOUT_PATHS,list) or any(not isinstance(p,str) for p in CHECKOUT_PATHS): parser.error('checkout_paths must be a list of paths')
  REVIEW_LABELS=config.get('review_labels',{})
  if not isinstance(REVIEW_LABELS,dict) or any(not isinstance(v,dict) or any(not isinstance(k,str) or not isinstance(label,str) for k,label in v.items()) for v in REVIEW_LABELS.values()):
   parser.error('review_labels must map repositories to team-slug/label objects')
 except (ValueError,TypeError,OSError) as e: parser.error(str(e))
PORT=int(os.environ.get('PORT','8765'))
CACHE={'data':None,'error':None,'refreshing':False}
LOCK=threading.Lock()
def run(args,cwd=None):
 p=subprocess.run(args,cwd=cwd,capture_output=True,text=True,timeout=90)
 if p.returncode: raise RuntimeError(p.stderr.strip()[:500] or 'Command failed')
 return p.stdout.strip()
def gh(*args): return json.loads(run(['gh',*args]))
def graph(query,**variables):
 args=['api','graphql','-f','query='+query]
 for k,v in variables.items(): args+=['-F',f'{k}={v}']
 x=gh(*args)
 if x.get('errors'): raise RuntimeError(str(x['errors']))
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
 if c.get('status') and c['status']!='COMPLETED' or value in ('PENDING','EXPECTED'): return 'pending'
 if value=='SUCCESS': return 'passed'
 if value in ('NEUTRAL','SKIPPED'): return 'neutral'
 return 'unknown'
def discover_repositories(login):
 results=gh('search','prs','--author',login,'--state','open','--limit','1000','--json','repository')
 return sorted({p['repository']['nameWithOwner'] for p in results if p.get('repository',{}).get('nameWithOwner')})
def collect_repository(repo,login):
 fields='number,title,headRefName,headRepositoryOwner,headRepository,baseRefName,reviewDecision,statusCheckRollup,isDraft,mergeable,mergeStateStatus,updatedAt,createdAt,url,additions,deletions,changedFiles,reviewRequests,reviews,comments'
 prs=gh('pr','list','--repo',repo,'--author',login,'--state','open','--limit','10000','--json',fields)
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  futures={pool.submit(discussion,repo,p['number']):p for p in prs}
  for f,p in futures.items():
   try: p['threads']=f.result(); p['discussionError']=None
   except Exception as e: p['threads']=[]; p['discussionError']=str(e)
 for p in prs:
  p['repo']=repo
  p['reviewLabels']=[REVIEW_LABELS.get(repo,{}).get((r.get('slug') or r.get('name') or '').split('/')[-1],r.get('name') or r.get('slug')) for r in p['reviewRequests'] if r.get('__typename')=='Team']
  p['checks']=[dict(c,category=check_state(c)) for c in p.pop('statusCheckRollup') or []]
  p['unresolved']=[t for t in p['threads'] if not t['isResolved']]
  for t in p['unresolved']:
   author=(t['comments']['nodes'][0].get('author') or {}) if t['comments']['nodes'] else {}
   login2=author.get('login','deleted')
   t['kind']='bugbot' if 'bugbot' in login2.lower() or login2.lower() in ('cursor','cursor[bot]') else 'bot' if author.get('__typename')=='Bot' else 'human'
  p['failed']=sum(c['category']=='failed' for c in p['checks'])
  p['advisory']=sum(c['category']=='advisory' for c in p['checks'])
  p['pending']=sum(c['category']=='pending' for c in p['checks'])
 return prs

def github_remote(remote):
 match=re.fullmatch(r'(?:https?://github\.com/|ssh://git@github\.com/|git@github\.com:)([^/]+/[^/]+?)(?:\.git)?/?',remote.strip(),re.I)
 return match.group(1).lower() if match else None

def scan_checkouts(paths):
 def git(path,*args):
  result=subprocess.run(['git','--no-optional-locks','-C',str(path),*args],capture_output=True,text=True,timeout=5)
  if result.returncode: raise RuntimeError('Git checkout unavailable')
  return result.stdout.strip()
 candidates=set()
 for raw in paths:
  path=pathlib.Path(raw).expanduser()
  if not path.is_absolute(): path=ROOT/path
  try:
   candidates.add(path.resolve())
   candidates.update(p.resolve() for p in path.iterdir() if p.is_dir() and (p/'.git').exists())
  except OSError: pass
 def worktrees(path):
  try:
   return [pathlib.Path(field[9:]).resolve() for field in git(path,'worktree','list','--porcelain','-z').split('\0') if field.startswith('worktree ')]
  except (OSError,RuntimeError,subprocess.TimeoutExpired): return []
 def inspect(path):
  try:
   branch=git(path,'symbolic-ref','--quiet','--short','HEAD')
   remotes={github_remote(line.split(' ',1)[1]) for line in git(path,'config','--get-regexp',r'^remote\..*\.url$').splitlines() if ' ' in line}
   return [{'repo':repo,'branch':branch,'name':path.name,'path':str(path)} for repo in sorted(remotes-{None})]
  except (OSError,RuntimeError,subprocess.TimeoutExpired): return []
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  for paths in pool.map(worktrees,list(candidates)): candidates.update(paths)
  return [row for rows in pool.map(inspect,sorted(candidates)) for row in rows]

def attach_checkouts(repositories,checkouts):
 for repository in repositories:
  for pr in repository['prs']:
   head=pr.get('headRepository') or {}
   owner=pr.get('headRepositoryOwner') or {}
   repo=f"{owner.get('login','')}/{head.get('name','')}".lower()
   pr['checkouts']=[{'name':c['name'],'path':c['path']} for c in checkouts if c['repo']==repo and c['branch']==pr['headRefName']]

def refresh():
 with LOCK:
  if CACHE['refreshing']: return
  CACHE['refreshing']=True
 try:
  checkout_pool=concurrent.futures.ThreadPoolExecutor(max_workers=1)
  checkout_future=checkout_pool.submit(scan_checkouts,CHECKOUT_PATHS)
  login=AUTHOR or gh('api','user')['login']
  repos=REPOS or discover_repositories(login)
  with LOCK: previous=CACHE['data']
  old={r['name']:r for r in (previous or {}).get('repositories',[])} if previous and previous['login']==login else {}
  discovered=set(repos)
  if not REPOS: repos=sorted(discovered | old.keys())
  repositories=[]
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
   futures={repo:pool.submit(collect_repository,repo,login) for repo in repos}
   by_future={future:repo for repo,future in futures.items()}
   for future in concurrent.futures.as_completed(by_future):
    repo=by_future[future]
    try:
     prs=future.result()
     if not REPOS and repo not in discovered and not prs: continue
     repositories.append({'name':repo,'prs':prs,'error':None,'updatedAt':time.time()})
    except Exception as e: repositories.append(dict(old.get(repo,{'name':repo,'prs':[],'updatedAt':None}),error=str(e)))
    completed={r['name']:r for r in repositories}
    partial=[completed.get(name,old.get(name,{'name':name,'prs':[],'error':None,'updatedAt':None})) for name in repos]
    if checkout_future.done(): attach_checkouts(partial,checkout_future.result())
    with LOCK: CACHE.update(data={'login':login,'repositories':partial,'updatedAt':time.time()},error=None)
  repositories.sort(key=lambda r:repos.index(r['name']))
  attach_checkouts(repositories,checkout_future.result())
  with LOCK: CACHE.update(data={'login':login,'repositories':repositories,'updatedAt':time.time()},error=None)
 except Exception as e:
  with LOCK: CACHE['error']=str(e)
 finally:
  if 'checkout_pool' in locals(): checkout_pool.shutdown(wait=False)
  with LOCK: CACHE['refreshing']=False

def loop():
 while True: refresh(); time.sleep(INTERVAL)
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
  if self.path!='/api/refresh' or self.headers.get('Origin') not in (f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}') or self.headers.get('Host') not in (f'127.0.0.1:{PORT}',f'localhost:{PORT}'):
   self.send_error(403);return
  threading.Thread(target=refresh,daemon=True).start(); self.send_response(202);self.end_headers()
 def log_message(self,*args): pass
if __name__=='__main__':
 configure()
 threading.Thread(target=loop,daemon=True).start()
 print(f'Dashboard listening at http://127.0.0.1:{PORT}',flush=True)
 ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
