import importlib.util
import pathlib
import unittest
from unittest.mock import Mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'start_app.py'

spec = importlib.util.spec_from_file_location('start_app_under_test', MODULE_PATH)
start_app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(start_app)


class SaveClassListTests(unittest.TestCase):
    def test_save_class_list_uses_postgres_safe_upsert(self):
        cursor = Mock()
        class_list = [
            {"marker_id": 1, "student_id": "s1", "name": "Ada", "class": "A", "section": "X"}
        ]

        start_app.save_class_list(cursor, class_list)

        first_call = cursor.execute.call_args_list[0]
        self.assertEqual(first_call.args[0], "DELETE FROM students")

        second_call = cursor.execute.call_args_list[1]
        sql = second_call.args[0]
        self.assertIn("INSERT INTO students", sql)
        self.assertIn("ON CONFLICT (marker_id)", sql)
        self.assertIn("DO UPDATE", sql)
        self.assertEqual(second_call.args[1], (1, "s1", "Ada", "A", "X"))


if __name__ == '__main__':
    unittest.main()
