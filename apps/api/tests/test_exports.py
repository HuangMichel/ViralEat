import json
import tempfile
import unittest
from pathlib import Path

from app.exports import export_analysis
from app.store import Store


class ExportTests(unittest.TestCase):
    def test_export_contains_retained_results_and_no_private_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / "test.sqlite3")
            job, _ = store.create(
                "synthetic-command",
                "market",
                {"category_terms": ["pizza"]},
                "test-model",
            )
            job = store.claim()
            store.artifact(
                job["id"],
                "oriane",
                {
                    "payload": {
                        "data": {
                            "results": [{"id": "synthetic-source", "viewsCount": None}]
                        }
                    }
                },
            )
            store.artifact(
                job["id"],
                "openai",
                {"stage": "synthetic", "parsed_output": {"actions": []}},
            )
            store.finish(
                job["id"],
                {"sources": [{"source_id": "synthetic-source"}], "warnings": []},
            )
            exported = export_analysis(store, job["id"], Path(directory) / "exports")
            self.assertEqual(len(list(exported.glob("*.json"))), 6)
            manifest = json.loads(
                (exported / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["status"], "succeeded")
            self.assertFalse(manifest["market_coverage_complete"])
            self.assertEqual(
                json.loads((exported / "sources.json").read_text())[0]["source_id"],
                "synthetic-source",
            )
            self.assertNotIn(
                "Authorization", (exported / "oriane_responses.json").read_text()
            )
            self.assertNotIn("OPENAI_API_KEY", (exported / "manifest.json").read_text())
