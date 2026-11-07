import json
import tempfile
import unittest
from pathlib import Path

from app.schemas import MarketRequest
from app.settings import Settings
from app.store import Store
from app.study import StudyPlan, run_study
from tests.test_pipeline import benchmark_payload


class StudyTests(unittest.TestCase):
    def test_both_reports_are_exported_and_rerun_reuses_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(
                database=Path(directory) / "test.sqlite3",
                oriane_key="synthetic-key",
                oriane_header="Authorization",
                openai_key="synthetic-key",
            )
            store = Store(settings.database)
            benchmark = benchmark_payload()
            benchmark["benchmark_scope"] = "brand_accounts"
            market = MarketRequest(
                category_terms=["crousty"],
                include_llm=False,
                current={
                    "start_at": "2026-10-16T00:00:00Z",
                    "end_at": "2026-10-30T00:00:00Z",
                },
                previous={
                    "start_at": "2026-09-18T00:00:00Z",
                    "end_at": "2026-10-16T00:00:00Z",
                },
            )
            plan = StudyPlan(
                title="Synthetic study",
                selection_basis={"fixture": True},
                benchmark=benchmark,
                market=market,
            )
            calls = []

            def processor(job, settings, store):
                calls.append(job["id"])
                store.finish(
                    job["id"],
                    {
                        "kind": job["kind"],
                        "sources": [],
                        "warnings": [],
                        "ai": {"availability": "not_requested", "actions": []},
                    },
                )

            output = Path(directory) / "exports"
            run_study(plan, settings, output, processor)
            run_study(plan, settings, output, processor)
            self.assertEqual(len(calls), 2)
            bundle = json.loads((output / "study_output.json").read_text())
            self.assertEqual(len(bundle["analyses"]), 2)
            self.assertIsNotNone(bundle["benchmark"])
            self.assertIsNotNone(bundle["market"])
