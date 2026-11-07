import unittest
from datetime import datetime, timezone

from app.models import counter, deduplicate, normalize, timestamp


class NormalizationTests(unittest.TestCase):
    def test_synthetic_provider_response_preserves_null_and_media_evidence(self):
        raw = {
            "id": "synthetic-1",
            "platform": "instagram",
            "platformId": "synthetic-post",
            "profileHandle": "@Example",
            "viewsCount": None,
            "interactionsCount": 0,
            "likesCount": 0,
            "sharesCount": None,
            "profileFollowersCount": 0,
            "media": [
                {
                    "transcript": "Synthetic transcript",
                    "transcriptChunks": [
                        {
                            "text": "Synthetic transcript",
                            "startSeconds": 1,
                            "endSeconds": 2,
                        }
                    ],
                }
            ],
        }
        item = normalize(raw, datetime.now(timezone.utc))
        self.assertIsNone(item.views)
        self.assertEqual(item.interactions, 0)
        self.assertEqual(item.likes, 0)
        self.assertIsNone(item.shares)
        self.assertIsNone(item.engagement_followers_percent)
        self.assertEqual(item.texts["media.0.transcript"], "Synthetic transcript")
        self.assertEqual(item.handle, "example")
        self.assertEqual(len(deduplicate([item, item])), 1)

    def test_invalid_counters_and_dates_are_unknown(self):
        for value in (True, -1, float("nan"), float("inf"), "100"):
            self.assertIsNone(counter(value))
        self.assertIsNone(timestamp("not-a-date"))
        self.assertIsNone(timestamp("2026-11-01T00:00:00"))
