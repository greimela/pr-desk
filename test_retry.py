import unittest
from unittest.mock import patch
import server


class RetryTests(unittest.TestCase):
    def setUp(self):
        self.check = {'status': 'COMPLETED', 'conclusion': 'FAILURE', 'detailsUrl': 'https://github.com/acme/app/actions/runs/12/job/34'}
        self.data = {'repositories': [{'name': 'acme/app', 'prs': [{'number': 7, 'checks': [self.check]}]}]}

    def test_retries_only_a_cached_completed_actions_job(self):
        with patch.dict(server.CACHE, data=self.data), patch.object(server, 'run') as run:
            server.retry_check('acme/app', 7, '34')
            run.assert_called_once_with(['gh', 'api', '--method', 'POST', 'repos/acme/app/actions/jobs/34/rerun'])

    def test_rejects_unknown_jobs_repositories_and_pending_checks(self):
        with patch.dict(server.CACHE, data=self.data), patch.object(server, 'run') as run:
            for args in [('acme/app', 7, '99'), ('other/app', 7, '34'), ('acme/app', 8, '34'), ('acme/app', 7, '../34')]:
                with self.assertRaises(ValueError):
                    server.retry_check(*args)
            self.check['status'] = 'IN_PROGRESS'
            with self.assertRaises(ValueError):
                server.retry_check('acme/app', 7, '34')
            run.assert_not_called()

    def test_external_and_other_repository_links_are_not_retryable(self):
        for url in ['https://example.com/acme/app/actions/runs/12/job/34', 'https://github.com/other/app/actions/runs/12/job/34', 'https://github.com/acme/app/actions/runs/12']:
            self.assertIsNone(server.retry_job_id('acme/app', dict(self.check, detailsUrl=url)))


    def test_only_failed_checks_are_retryable(self):
        for conclusion in ('SUCCESS', 'NEUTRAL', 'SKIPPED', ''):
            with self.subTest(conclusion=conclusion):
                self.assertIsNone(server.retry_job_id('acme/app', dict(self.check, conclusion=conclusion)))
        self.assertEqual(server.retry_job_id('acme/app', dict(self.check, name='npm audit')), '34')


class MergeTests(unittest.TestCase):
    def setUp(self):
        pr = {'number': 7, 'headRefOid': 'abc123', 'isDraft': False}
        self.data = {'repositories': [{'name': 'acme/app', 'prs': [pr], 'reviews': [{'number': 8, 'headRefOid': 'def'}]}]}

    def test_merges_own_pull_request_at_the_shown_commit_with_an_allowed_method(self):
        for allowed, method in [
            ({'squashMergeAllowed': True, 'mergeCommitAllowed': True, 'rebaseMergeAllowed': True}, '--merge'),
            ({'squashMergeAllowed': True, 'mergeCommitAllowed': False, 'rebaseMergeAllowed': True}, '--squash'),
        ]:
            with self.subTest(method=method), patch.dict(server.CACHE, data=self.data), patch.object(server, 'gh', return_value=allowed), patch.object(server, 'run') as run:
                server.merge_pull_request('acme/app', 7)
                run.assert_called_once_with(['gh', 'pr', 'merge', '7', '--repo', 'acme/app', method, '--match-head-commit', 'abc123'])

    def test_rejects_unknown_others_and_draft_pull_requests(self):
        self.data['repositories'][0]['prs'].append({'number': 9, 'headRefOid': 'x', 'isDraft': True})
        with patch.dict(server.CACHE, data=self.data), patch.object(server, 'gh') as gh, patch.object(server, 'run') as run:
            for args in [('acme/app', 8), ('acme/app', 99), ('other/app', 7), ('acme/app', '7'), ('acme/app', 9)]:
                with self.assertRaises(ValueError):
                    server.merge_pull_request(*args)
            gh.assert_not_called()
            run.assert_not_called()
