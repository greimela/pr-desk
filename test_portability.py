import time
import unittest
from unittest.mock import patch
import server

class PortabilityTests(unittest.TestCase):
 def setUp(self):
  audit=patch.object(server,'main_branch_audit',return_value={'branch':'main','failures':[]})
  audit.start(); self.addCleanup(audit.stop)
  server.LAST_FULL=0
 def test_discovers_unique_repositories_with_open_prs(self):
  results=[
   {'repository':{'nameWithOwner':'two/repo'}},
   {'repository':{'nameWithOwner':'one/repo'}},
   {'repository':{'nameWithOwner':'two/repo'}},
  ]
  with patch.object(server,'gh',return_value=results) as gh:
   self.assertEqual(server.discover_repositories('alice'),['one/repo','two/repo'])
  gh.assert_called_once_with('search','prs','--author','alice','--state','open','--limit','1000','--json','repository')
 def test_discovers_review_requests_excluding_drafts(self):
  with patch.object(server,'gh',return_value=[{'repository':{'nameWithOwner':'team/repo'}}]) as gh:
   self.assertEqual(server.discover_repositories('alice',reviewer=True),['team/repo'])
  gh.assert_called_once_with('search','prs','--review-requested','alice','--draft=false','--state','open','--limit','1000','--json','repository')
 def test_review_requests_are_published_separately_and_flag_rereviews(self):
  server.REPOS=['one/repo'];server.AUTHOR='alice'
  server.CACHE.update(data=None,refreshing=False,error=None)
  pr=lambda n,reviews:{'number':n,'reviews':reviews,'reviewRequests':[],'statusCheckRollup':[]}
  def fake_gh(*args):
   if args[:2]!=('pr','list'):return []
   search=args[args.index('--search')+1] if '--search' in args else ''
   if search=='review-requested:alice draft:false':return [pr(2,[{'author':{'login':'alice'}}]),pr(3,[])]
   if search.startswith('draft:false -author:alice -review-requested:alice -review:approved updated:>='):
    self.assertEqual(args[args.index('--limit')+1],'30')
    return [dict(pr(4,[]),author={'login':'bob','is_bot':False}),dict(pr(5,[]),author={'login':'dependabot','is_bot':True}),pr(3,[])]
   return [pr(1,[])]
  no_threads=lambda repo,prs:[p.update(threads=[],discussionError=None) for p in prs]
  with patch.object(server,'gh',side_effect=fake_gh),patch.object(server,'attach_threads',side_effect=no_threads):server.refresh()
  repo=server.CACHE['data']['repositories'][0]
  self.assertEqual([p['number'] for p in repo['prs']],[1])
  self.assertEqual([(p['number'],p['rereview']) for p in repo['reviews']],[(2,True),(3,False)])
  self.assertEqual([p['number'] for p in repo['ready']],[4])
 def test_repo_failure_preserves_only_its_snapshot(self):
  server.REPOS=['one/repo','two/repo'];server.AUTHOR='alice'
  server.CACHE.update(data={'login':'alice','repositories':[{'name':'two/repo','prs':[{'number':4}],'updatedAt':1,'error':None}]},refreshing=False,error=None)
  def collect(repo,login,full):
   self.assertEqual(login,'alice')
   if repo=='two/repo':raise RuntimeError('No access')
   return [{'number':4,'repo':repo}],[],[],None
  with patch.object(server,'collect_all',side_effect=collect):server.refresh()
  repos=server.CACHE['data']['repositories']
  self.assertEqual(repos[0]['prs'][0]['repo'],'one/repo')
  self.assertEqual(repos[1]['prs'],[{'number':4}])
  self.assertEqual(repos[1]['error'],'No access')
 def test_account_change_does_not_reuse_old_data(self):
  server.REPOS=['two/repo'];server.AUTHOR='bob'
  server.CACHE.update(data={'login':'alice','repositories':[{'name':'two/repo','prs':[{'number':4}]}]},refreshing=False)
  with patch.object(server,'collect_all',side_effect=RuntimeError('No access')):server.refresh()
  self.assertEqual(server.CACHE['data']['repositories'][0]['prs'],[])
class MainBranchAuditTests(unittest.TestCase):
 def test_reports_failed_audit_checks_across_pages(self):
  def page(nodes,more):
   return {'repository':{'defaultBranchRef':{'name':'main','target':{'statusCheckRollup':{'contexts':{'pageInfo':{'hasNextPage':more,'endCursor':'c1'},'nodes':nodes}}}}}}
  pages=[page([{'name':'test','status':'COMPLETED','conclusion':'FAILURE'}],True),
         page([{'name':'Check npm audit (macos)','status':'COMPLETED','conclusion':'FAILURE','detailsUrl':'https://x','checkSuite':{'workflowRun':{'workflow':{'name':'Check npm audit'}}}}],False)]
  with patch.object(server,'graph',side_effect=pages):
   self.assertEqual(server.main_branch_audit('o/r'),{'branch':'main','failures':[{'name':'Check npm audit (macos)','url':'https://x'}]})
 def test_repository_without_checks_has_no_failures(self):
  with patch.object(server,'graph',return_value={'repository':{'defaultBranchRef':None}}):
   self.assertEqual(server.main_branch_audit('o/r'),{'branch':None,'failures':[]})

class DiscoveryRefreshTests(unittest.TestCase):
 def setUp(self):
  audit=patch.object(server,'main_branch_audit',return_value={'branch':'main','failures':[]})
  audit.start(); self.addCleanup(audit.stop)
  server.LAST_FULL=0
 def test_rechecks_known_repositories_missing_from_discovery(self):
  server.AUTHOR='alice';server.REPOS=[]
  server.CACHE.update(data={'login':'alice','repositories':[{'name':'one/repo','prs':[{'number':1}],'updatedAt':1,'error':None}]},error=None,refreshing=False)
  with patch.object(server,'discover_repositories',return_value=[]), patch.object(server,'collect_all',return_value=([{'number':1}],[],[],None)) as collect:
   server.refresh()
  collect.assert_called_once_with('one/repo','alice',True)
  self.assertEqual(len(server.CACHE['data']['repositories']),1)
 def test_removes_missing_repository_when_direct_lookup_confirms_no_prs(self):
  server.AUTHOR='alice';server.REPOS=[]
  server.CACHE.update(data={'login':'alice','repositories':[{'name':'one/repo','prs':[{'number':1}],'updatedAt':1,'error':None}]},error=None,refreshing=False)
  with patch.object(server,'discover_repositories',return_value=[]), patch.object(server,'collect_all',return_value=([],[],[],None)):
   server.refresh()
  self.assertEqual(server.CACHE['data']['repositories'],[])

class RateLimitTests(unittest.TestCase):
 def setUp(self):
  server.AUTHOR='alice';server.REPOS=['one/repo'];server.LAST_FULL=0;server.BACKOFF=0
  server.CACHE.update(data=None,error=None,refreshing=False,rateLimitedUntil=None)
 def test_slow_parts_are_reused_between_full_refreshes(self):
  calls=[]
  def collect(repo,login,full):
   calls.append(full)
   return [{'number':1}],[{'number':2}],([{'number':3}] if full else None),({'branch':'main','failures':[]} if full else None)
  with patch.object(server,'collect_all',side_effect=collect):
   server.refresh();server.refresh()
  self.assertEqual(calls,[True,False])
  repo=server.CACHE['data']['repositories'][0]
  self.assertEqual([p['number'] for p in repo['ready']],[3])
  self.assertEqual(repo['mainAudit'],{'branch':'main','failures':[]})
  with patch.object(server,'collect_all',side_effect=collect):server.refresh(full=True)
  self.assertEqual(calls,[True,False,True])
 def test_rate_limit_pauses_until_reset_and_keeps_old_data(self):
  server.CACHE.update(data={'login':'alice','repositories':[{'name':'one/repo','prs':[{'number':1}],'updatedAt':1,'error':None}]})
  def limited(*args):
   server.note_rate_limit('GraphQL: API rate limit already exceeded for user ID 1.')
   raise RuntimeError('GraphQL: API rate limit already exceeded for user ID 1.')
  reset=time.time()+1200
  with patch.object(server,'collect_all',side_effect=limited),patch.object(server,'gh',return_value={'resources':{'graphql':{'remaining':0,'reset':reset}}}):
   server.refresh()
  self.assertEqual(server.CACHE['rateLimitedUntil'],reset)
  self.assertEqual(server.CACHE['data']['repositories'][0]['prs'],[{'number':1}])
  self.assertEqual(server.LAST_FULL,0,'A rate-limited refresh must not count as a full refresh')
  with patch.object(server,'collect_all',return_value=([],[],[],None)):server.refresh()
  self.assertIsNone(server.CACHE['rateLimitedUntil'])
 def test_backoff_grows_when_github_reports_no_reset(self):
  with patch.object(server,'gh',side_effect=RuntimeError('offline')):
   first=server.rate_limit_until()-time.time();second=server.rate_limit_until()-time.time()
  self.assertAlmostEqual(first,300,delta=5);self.assertAlmostEqual(second,600,delta=5)

class ListTests(unittest.TestCase):
 def test_asks_for_more_only_when_the_first_page_is_full(self):
  pages={'20':[{'number':n} for n in range(20)],'100':[{'number':n} for n in range(25)]}
  with patch.object(server,'gh',side_effect=lambda *args:pages[args[args.index('--limit')+1]]) as gh:
   self.assertEqual(len(server.list_prs('o/r','alice')),25)
  self.assertEqual([c.args[c.args.index('--limit')+1] for c in gh.call_args_list],['20','100'])
  with patch.object(server,'gh',return_value=[{'number':1}]) as gh:
   server.list_prs('o/r','alice',reviewer=True)
  gh.assert_called_once()

class DeploymentTests(unittest.TestCase):
 def status(self,deployments,statuses):
  def fake_gh(_,path):
   return deployments if '/statuses' not in path else statuses[path.split('/')[-2]]
  with patch.object(server,'gh',side_effect=fake_gh):
   return server.deployment_status('o/r','prod-mainnet')
 def test_combines_the_jobs_of_the_latest_release(self):
  deployments=[{'id':2,'sha':'b','ref':'2026-10-08','created_at':'2026-10-08T12:24:09Z','creator':{'login':'alice'}},{'id':1,'sha':'b'},{'id':0,'sha':'a'}]
  url='https://github.com/o/r/actions/runs/9/job/'
  statuses={'2':[{'state':'success','created_at':'2026-10-08T13:00:00Z','log_url':url+'1'}],'1':[{'state':'in_progress','created_at':'2026-10-08T13:01:00Z','log_url':url+'2'}],'0':[{'state':'failure'}]}
  self.assertEqual(self.status(deployments,statuses),{'environment':'prod-mainnet','state':'in_progress','ref':'2026-10-08','url':'https://github.com/o/r/actions/runs/9','createdAt':'2026-10-08T12:24:09Z','actor':'alice','updatedAt':'2026-10-08T13:01:00Z'})
  for states,expected in [(('success','failure'),'failed'),(('waiting','queued'),'waiting'),(('success','inactive'),'success')]:
   statuses={'2':[{'state':states[0]}],'1':[{'state':states[1]}]}
   self.assertEqual(self.status(deployments,statuses)['state'],expected)
 def test_environment_without_deployments(self):
  self.assertIsNone(self.status([],{}))

class ScheduledRunTests(unittest.TestCase):
 def test_reports_the_latest_finished_scheduled_run(self):
  run={'name':'App E2E Blockchain','conclusion':'failure','head_branch':'main','html_url':'https://x','updated_at':'2026-10-13T08:01:12Z'}
  with patch.object(server,'gh',return_value={'workflow_runs':[run]}) as gh:
   self.assertEqual(server.scheduled_run('o/r','e2e.yml'),{'workflow':'e2e.yml','name':'App E2E Blockchain','failed':True,'branch':'main','url':'https://x','updatedAt':'2026-10-13T08:01:12Z'})
  gh.assert_called_once_with('api','repos/o/r/actions/workflows/e2e.yml/runs?event=schedule&status=completed&per_page=1')
  for conclusion,failed in [('success',False),('cancelled',False),('timed_out',True)]:
   with patch.object(server,'gh',return_value={'workflow_runs':[dict(run,conclusion=conclusion)]}):
    self.assertEqual(server.scheduled_run('o/r','e2e.yml')['failed'],failed)
 def test_workflow_without_scheduled_runs(self):
  with patch.object(server,'gh',return_value={'workflow_runs':[]}):
   self.assertIsNone(server.scheduled_run('o/r','e2e.yml'))
 def test_refresh_publishes_watched_workflows_and_keeps_the_last_result_on_errors(self):
  server.REPOS=['one/repo'];server.AUTHOR='alice';server.LAST_FULL=0
  server.CACHE.update(data=None,refreshing=False,error=None)
  failed={'workflow':'e2e.yml','name':'E2E','failed':True,'branch':'main','url':None,'updatedAt':None}
  with patch.object(server,'WATCH_SCHEDULED_WORKFLOWS',{'one/repo':['e2e.yml']}),patch.object(server,'collect_all',return_value=([],[],[],None)):
   with patch.object(server,'scheduled_run',return_value=failed):server.refresh()
   self.assertEqual(server.CACHE['data']['repositories'][0]['scheduledRuns'],[failed])
   with patch.object(server,'scheduled_run',side_effect=RuntimeError('offline')):server.refresh()
   self.assertEqual(server.CACHE['data']['repositories'][0]['scheduledRuns'],[failed])

class ThreadTests(unittest.TestCase):
 def test_loads_threads_for_many_prs_in_one_query(self):
  open_thread={'isResolved':False,'comments':{'nodes':[]}}
  page=lambda nodes,more=False:{'pageInfo':{'hasNextPage':more},'nodes':nodes}
  data={'repository':{'p1':{'reviewThreads':page([open_thread])},'p2':{'reviewThreads':page([],True)},'p3':{'reviewThreads':page([])}}}
  prs=[{'number':1},{'number':2},{'number':3},{'number':1}]
  with patch.object(server,'graph',return_value=data) as graph,patch.object(server,'discussion',return_value=['all']) as discussion:
   server.attach_threads('o/r',prs)
  graph.assert_called_once()
  discussion.assert_called_once_with('o/r',2)
  self.assertEqual([p['threads'] for p in prs],[[open_thread],['all'],[],[open_thread]])
  self.assertTrue(all(p['discussionError'] is None for p in prs))
 def test_failed_query_marks_threads_unavailable(self):
  prs=[{'number':1}]
  with patch.object(server,'graph',side_effect=RuntimeError('boom')):server.attach_threads('o/r',prs)
  self.assertEqual(prs,[{'number':1,'threads':[],'discussionError':'boom'}])

if __name__=='__main__':unittest.main()
