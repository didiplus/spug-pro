from unittest.mock import patch

from django.test import SimpleTestCase

from apps.exec.models import InspectTask


class InspectTaskViewTests(SimpleTestCase):
    def test_to_view_includes_latest_status_summary(self):
        task = InspectTask(
            id=1,
            name='demo task',
            script_id=1,
            interpreter='sh',
            command='echo ok',
            host_ids='[]',
            notify_grp='[]',
            notify_mode='[]',
        )

        latest_result = type('Result', (), {
            'status': 'warning',
            'run_at': '2026-07-29 10:00:00',
            'exit_code': 1,
        })()

        with patch('apps.exec.models.InspectResult.objects.filter') as filter_mock:
            filter_mock.return_value.order_by.return_value.first.return_value = latest_result
            filter_mock.return_value.count.return_value = 2
            with patch('apps.exec.models.InspectScript.objects.filter') as script_filter:
                script_filter.return_value.first.return_value = type('Script', (), {'name': 'demo script'})()
                view = task.to_view()

        self.assertEqual(view['latest_status'], 'warning')
        self.assertEqual(view['latest_run_at'], '2026-07-29 10:00:00')
        self.assertEqual(view['result_count'], 2)
