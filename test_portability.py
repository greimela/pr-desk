import unittest
from unittest.mock import patch
import server

class PortabilityTests(unittest.TestCase):
 def test_repo_failure_preserves_only_its_snapshot(self):
  server.REPOS=['one/repo','two/repo'];server.AUTHOR='alice'
  server.CACHE.update(data={'login':'alice','repositories':[{'name':'two/repo','prs':[{'number':4}],'updatedAt':1,'error':None}]},refreshing=False,error=None)
  def collect(repo,login):
   self.assertEqual(login,'alice')
   if repo=='two/repo':raise RuntimeError('No access')
   return [{'number':4,'repo':repo}]
  with patch.object(server,'collect_repository',side_effect=collect):server.refresh()
  repos=server.CACHE['data']['repositories']
  self.assertEqual(repos[0]['prs'][0]['repo'],'one/repo')
  self.assertEqual(repos[1]['prs'],[{'number':4}])
  self.assertEqual(repos[1]['error'],'No access')
 def test_account_change_does_not_reuse_old_data(self):
  server.REPOS=['two/repo'];server.AUTHOR='bob'
  server.CACHE.update(data={'login':'alice','repositories':[{'name':'two/repo','prs':[{'number':4}]}]},refreshing=False)
  with patch.object(server,'collect_repository',side_effect=RuntimeError('No access')):server.refresh()
  self.assertEqual(server.CACHE['data']['repositories'][0]['prs'],[])
 def test_thread_query_uses_configured_repo(self):
  with patch.object(server,'graph',return_value={'repository':{'pullRequest':{'reviewThreads':{'nodes':[],'pageInfo':{'hasNextPage':False}}}}}) as graph:
   server.discussion('another/project',42)
   self.assertIn('owner:"another",name:"project"',graph.call_args.args[0])
if __name__=='__main__':unittest.main()
