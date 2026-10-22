import threading
import unittest
from unittest.mock import patch
import server

class RefreshLatencyTests(unittest.TestCase):
 def setUp(self):
  audit=patch.object(server,'main_branch_audit',return_value={'branch':'main','failures':[]})
  audit.start(); self.addCleanup(audit.stop)
 def test_fast_repository_publishes_before_slow_repository_finishes(self):
  release=threading.Event()
  fast=threading.Event()
  def collect(repo,login,full):
   if repo=='slow/repo': release.wait(3)
   else: fast.set()
   return [],[],[],None
  with patch.object(server,'REPOS',['slow/repo','fast/repo']),patch.object(server,'AUTHOR','tester'),patch.object(server,'collect_all',side_effect=collect),patch.object(server,'CACHE',{'data':None,'error':None,'refreshing':False,'rateLimitedUntil':None}):
   worker=threading.Thread(target=server.refresh);worker.start()
   try:
    self.assertTrue(fast.wait(1))
    import time
    deadline=time.monotonic()+1
    while server.CACHE['data'] is None and time.monotonic()<deadline:time.sleep(.01)
    self.assertIsNotNone(server.CACHE['data'],'Fast repo should not wait for slow repo')
    self.assertTrue(server.CACHE['refreshing'])
    self.assertIsNotNone(server.CACHE['data']['repositories'][1]['updatedAt'])
   finally:release.set();worker.join(3)
