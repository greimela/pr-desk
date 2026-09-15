import threading
import unittest
from unittest.mock import patch
import server

class RefreshLatencyTests(unittest.TestCase):
 def test_fast_repository_publishes_before_slow_repository_finishes(self):
  release=threading.Event()
  fast=threading.Event()
  def collect(repo,login):
   if repo=='slow/repo': release.wait(3)
   else: fast.set()
   return []
  with patch.object(server,'REPOS',['slow/repo','fast/repo']),patch.object(server,'AUTHOR','tester'),patch.object(server,'scan_checkouts',return_value=[]),patch.object(server,'collect_repository',side_effect=collect),patch.object(server,'CACHE',{'data':None,'error':None,'refreshing':False}):
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
