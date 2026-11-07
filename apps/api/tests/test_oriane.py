import tempfile
import unittest
from pathlib import Path

import httpx

from app.oriane import Oriane
from app.settings import Settings
from app.store import ControlledError, Store


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.directory.name) / "test.sqlite3")
        self.job, _ = self.store.create("synthetic-key", "market", {}, "test-model")
        self.settings = Settings(
            oriane_key="synthetic-key",
            oriane_header="Authorization",
            oriane_scheme="Bearer",
        )

    def tearDown(self):
        self.directory.cleanup()

    def test_206_is_success_and_repeated_search_uses_cache(self):
        calls = []

        def handler(request):
            calls.append(request)
            self.assertEqual(request.headers["Authorization"], "Bearer synthetic-key")
            return httpx.Response(
                206,
                json={
                    "data": {
                        "results": [
                            {
                                "id": "synthetic-content",
                                "platform": "instagram",
                                "viewsCount": None,
                            }
                        ]
                    },
                    "metadata": {
                        "pagination": {"offset": 0, "limit": 1, "totalCount": 2}
                    },
                },
            )

        adapter = Oriane(
            self.settings, self.store, self.job["id"], httpx.MockTransport(handler)
        )
        try:
            result = adapter.collect({}, 1)
            self.assertFalse(result.complete)
            self.assertIsNone(result.contents[0].views)
            self.assertTrue(
                adapter.search("contents", {}, limit=1, projection="full")["cache_hit"]
            )
            self.assertEqual(len(calls), 1)
            self.assertEqual(self.store.get(self.job["id"])["requests"], 1)
        finally:
            adapter.close()

    def test_auth_errors_are_not_retried_and_budget_blocks_calls(self):
        adapter = Oriane(
            self.settings,
            self.store,
            self.job["id"],
            httpx.MockTransport(lambda request: httpx.Response(401, json={})),
        )
        try:
            with self.assertRaises(ControlledError) as caught:
                adapter.search("profiles", {}, limit=1, sort="followersCount")
            self.assertEqual(caught.exception.code, "PROVIDER_AUTH_FAILED")
            self.assertEqual(self.store.get(self.job["id"])["requests"], 1)
            with self.assertRaises(ControlledError):
                self.store.reserve(self.job["id"], "oriane", 10, 10)
        finally:
            adapter.close()

    def test_numeric_metadata_timestamp_is_valid(self):
        adapter = Oriane(
            self.settings,
            self.store,
            self.job["id"],
            httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    json={
                        "data": {"results": []},
                        "metadata": {
                            "timestamp": 1794050000000,
                            "pagination": {"offset": 0, "limit": 1, "totalCount": 0},
                        },
                    },
                )
            ),
        )
        try:
            collection = adapter.collect({}, 1)
            self.assertTrue(collection.complete)
            self.assertEqual(collection.contents, [])
        finally:
            adapter.close()

    def test_invalid_response_is_retained_with_secrets_redacted(self):
        adapter = Oriane(
            self.settings,
            self.store,
            self.job["id"],
            httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    json={
                        "data": {"results": []},
                        "metadata": {"requestId": "synthetic-request"},
                        "echo": "synthetic-key",
                    },
                )
            ),
        )
        try:
            with self.assertRaises(ControlledError) as caught:
                adapter.search("profiles", {}, limit=1, sort="followersCount")
            self.assertIn("metadata.pagination", caught.exception.message)
            artifact = self.store.artifacts(self.job["id"], "oriane")[0]
            self.assertEqual(artifact["http_status"], 200)
            self.assertEqual(artifact["payload"]["echo"], "[REDACTED]")
        finally:
            adapter.close()

    def test_idempotency_and_cancellation_are_persistent(self):
        replay, created = self.store.create("synthetic-key", "market", {}, "test-model")
        self.assertFalse(created)
        self.assertEqual(replay["id"], self.job["id"])
        with self.assertRaises(ControlledError):
            self.store.create(
                "synthetic-key", "market", {"changed": True}, "test-model"
            )
        self.store.cancel(self.job["id"])
        self.assertEqual(self.store.get(self.job["id"])["status"], "cancelled")
