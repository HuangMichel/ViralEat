import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import normalize
from app.oriane import Collection
from app.pipeline import Pipeline
from app.schemas import BenchmarkRequest, MarketRequest
from app.settings import Settings
from app.store import Store
from app.worker import process_job


def benchmark_payload():
    def restaurant(name, handle):
        return {
            "name": name,
            "accounts": [
                {"platform": "instagram", "handle": handle, "confirmed": True}
            ],
        }

    return {
        "own_restaurant": restaurant("Synthetic own", "own"),
        "competitors": [
            restaurant(f"Synthetic competitor {index}", f"peer{index}")
            for index in range(4)
        ],
        "area": {
            "city": "Paris",
            "min_latitude": 48.8,
            "max_latitude": 48.9,
            "min_longitude": 2.2,
            "max_longitude": 2.5,
        },
        "category_terms": ["pizza"],
        "window": {
            "start_at": "2026-10-01T00:00:00Z",
            "end_at": "2026-11-01T00:00:00Z",
        },
        "include_llm": False,
    }


class SyntheticAdapter:
    def __init__(self, *args):
        pass

    def collect(self, query, target):
        handle = query["filters"]["profileHandle"]["exactMatch"]["values"][0]
        item = normalize(
            {
                "id": f"synthetic-{handle}",
                "platformId": f"synthetic-{handle}",
                "platform": "instagram",
                "profileHandle": handle,
                "format": "video",
                "publishedAt": "2026-10-15T12:00:00Z",
                "viewsCount": 100 if handle == "own" else 200,
                "interactionsCount": 10,
            },
            datetime.now(timezone.utc),
        )
        return Collection(contents=[item], complete=True, matched_total=1)

    def close(self):
        pass


class SyntheticMarketAdapter(SyntheticAdapter):
    def collect(self, query, target):
        platform = query["filters"]["platform"]["includes"][0]
        current = query["filters"]["publishedAt"]["after"].startswith("2026-09-29")
        date = "2026-10-01T12:00:00Z" if current else "2026-09-10T12:00:00Z"
        items = [
            normalize(
                {
                    "id": f"synthetic-{platform}-{current}-{index}",
                    "platform": platform,
                    "platformId": f"synthetic-{platform}-{current}-{index}",
                    "profileHandle": f"creator{index}",
                    "publishedAt": date,
                    "viewsCount": 1000,
                    "profileFollowersCount": 10,
                    "interactionsCount": 100,
                    "hashtags": ["pizza"],
                    "format": "video",
                },
                datetime.now(timezone.utc),
            )
            for index in range(2 if current else 1)
        ]
        return Collection(contents=items, complete=True, matched_total=len(items))


class WorkflowTests(unittest.TestCase):
    def test_market_workflow_separates_platforms_and_normalizes_windows(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(
                database=Path(directory) / "test.sqlite3",
                oriane_key="synthetic-key",
                oriane_header="Authorization",
            )
            store = Store(settings.database)
            request = MarketRequest(
                category_terms=["pizza"],
                topics=["new menu"],
                include_llm=False,
                current={
                    "start_at": "2026-09-29T00:00:00Z",
                    "end_at": "2026-10-13T00:00:00Z",
                },
                previous={
                    "start_at": "2026-09-01T00:00:00Z",
                    "end_at": "2026-09-29T00:00:00Z",
                },
            )
            job, _ = store.create(
                "synthetic-market",
                "market",
                request.model_dump(mode="json"),
                "test-model",
            )
            job = store.claim()
            process_job(
                job,
                settings,
                store,
                Pipeline(settings, store, adapter_factory=SyntheticMarketAdapter),
            )
            report = json.loads(store.get(job["id"])["report"])
            self.assertEqual(len(report["coverage"]), 4)
            self.assertEqual(len(report["trends"]), 2)
            self.assertEqual(report["trends"][0]["growth_percent"], 300)
            self.assertEqual(
                {row["platform"] for row in report["trends"]}, {"instagram", "tiktok"}
            )
            self.assertEqual(len(report["viral_candidates"]), 4)
            self.assertEqual(report["product_opportunities"], [])

    def test_full_local_command_worker_report_and_idempotent_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(
                database=Path(directory) / "test.sqlite3",
                local_token="synthetic-local-key",
                oriane_key="synthetic-provider-key",
                oriane_header="Authorization",
            )
            store = Store(settings.database)
            client = TestClient(create_app(settings, store))
            headers = {
                "X-ViralEat-Key": "synthetic-local-key",
                "Idempotency-Key": "synthetic-command",
            }
            response = client.post(
                "/local/v1/benchmark", json=benchmark_payload(), headers=headers
            )
            self.assertEqual(response.status_code, 202)
            identity = response.json()["data"]["id"]
            replay = client.post(
                "/local/v1/benchmark", json=benchmark_payload(), headers=headers
            )
            self.assertEqual(replay.json()["data"]["id"], identity)
            job = store.claim()
            process_job(
                job,
                settings,
                store,
                Pipeline(settings, store, adapter_factory=SyntheticAdapter),
            )
            result = client.get(
                f"/local/v1/analyses/{identity}", headers=headers
            ).json()["data"]
            self.assertEqual(result["status"], "succeeded")
            self.assertEqual(len(result["report"]["competitor_accounts"]), 4)
            self.assertEqual(
                result["report"]["local_comparison"][0]["relative_difference_percent"],
                -50,
            )
            self.assertEqual(result["report"]["ai"]["availability"], "not_requested")

    def test_auth_missing_configuration_and_extra_input_reject_before_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(
                database=Path(directory) / "test.sqlite3",
                local_token="synthetic-local-key",
            )
            client = TestClient(create_app(settings))
            self.assertEqual(client.get("/local/v1/analyses/unknown").status_code, 401)
            headers = {
                "X-ViralEat-Key": "synthetic-local-key",
                "Idempotency-Key": "synthetic-command",
            }
            self.assertEqual(
                client.post(
                    "/local/v1/benchmark", json=benchmark_payload(), headers=headers
                ).status_code,
                503,
            )
            payload = benchmark_payload()
            payload["provider_key"] = "synthetic-secret"
            response = client.post("/local/v1/benchmark", json=payload, headers=headers)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn("synthetic-secret", response.text)
            self.assertEqual(
                client.get(
                    "/health", headers={"Origin": "https://evil.example"}
                ).status_code,
                403,
            )

    def test_benchmark_requires_four_confirmed_competitors(self):
        payload = benchmark_payload()
        payload["competitors"].pop()
        with self.assertRaises(ValueError):
            BenchmarkRequest.model_validate(payload)
