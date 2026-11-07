import unittest
from datetime import datetime, timezone

from app.metrics import account_metrics, trend_metrics, viral_candidates
from app.models import normalize
from app.queries import account_query, discovery_query, market_query
from app.schemas import Account, Area, DiscoveryRequest, MarketRequest, Window


def synthetic_post(identity, date, views=100, followers=10, handle="example"):
    return normalize(
        {
            "id": identity,
            "platform": "instagram",
            "platformId": identity,
            "publishedAt": date,
            "viewsCount": views,
            "profileFollowersCount": followers,
            "profileHandle": handle,
            "interactionsCount": 10,
            "format": "video",
            "hashtags": ["pizza", "pizza"],
        },
        datetime.now(timezone.utc),
    )


class MetricTests(unittest.TestCase):
    def setUp(self):
        self.previous = Window(
            start_at="2026-09-01T00:00:00Z", end_at="2026-09-29T00:00:00Z"
        )
        self.current = Window(
            start_at="2026-09-29T00:00:00Z", end_at="2026-10-13T00:00:00Z"
        )

    def test_null_metrics_and_truncated_posting_rate(self):
        post = synthetic_post("synthetic-1", "2026-10-01T12:00:00Z", views=None)
        result = account_metrics(
            [post, post], self.current, "Europe/Paris", complete=False
        )
        self.assertEqual(result["content_count"], 1)
        self.assertIsNone(result["mean_views"])
        self.assertIsNone(result["posts_per_week"])
        self.assertEqual(result["publication_hours"]["14"]["count"], 1)

    def test_exclusive_window_end_and_viral_ratio(self):
        post = synthetic_post("synthetic-1", "2026-10-13T00:00:00Z")
        self.assertEqual(
            account_metrics([post], self.current, "UTC", True)["content_count"], 0
        )
        self.assertEqual(
            viral_candidates([post], 10)[0]["views_per_follower_ratio"], 10
        )
        post.followers = 0
        self.assertEqual(viral_candidates([post], 1), [])

    def test_unequal_windows_are_normalized_and_zero_baseline_abstains(self):
        old = [synthetic_post("synthetic-old", "2026-09-10T12:00:00Z", handle="old")]
        new = [synthetic_post("synthetic-new", "2026-10-01T12:00:00Z", handle="new")]
        rows = trend_metrics(new, old, self.current, self.previous, [], [], 2, 2, True)
        self.assertEqual(rows[0]["growth_percent"], 100)
        self.assertEqual(rows[0]["current_count"], 1)
        rows = trend_metrics(new, [], self.current, self.previous, [], [], 2, 2, True)
        self.assertIsNone(rows[0]["growth_percent"])
        rows = trend_metrics(new, old, self.current, self.previous, [], [], 2, 2, False)
        self.assertEqual(rows[0]["status"], "insufficient_data")

    def test_queries_use_endpoint_specific_fields_and_french_geography(self):
        area = Area(
            city="Paris",
            min_latitude=48.8,
            max_latitude=48.9,
            min_longitude=2.2,
            max_longitude=2.5,
        )
        query = discovery_query(DiscoveryRequest(category_terms=["pizza"], area=area))
        self.assertIn("bio", query["filters"])
        self.assertNotIn("profileBio", query["filters"])
        account = Account(platform="instagram", handle="@Example", confirmed=True)
        self.assertEqual(
            account_query(account, self.current)["filters"]["profileHandle"][
                "exactMatch"
            ]["values"],
            ["example"],
        )
        market = MarketRequest(
            category_terms=["pizza"], current=self.current, previous=self.previous
        )
        query = market_query(market, self.current)
        self.assertIn("captionLanguage", query["queries"][1]["filters"])
        self.assertIn("locationCompleteAddress", query["queries"][3]["filters"])

    def test_profile_links_cannot_be_posts_or_other_hosts(self):
        for value in (
            "https://evil.example/user",
            "https://instagram.com/p/abc",
            "https://instagram.com/reel/",
        ):
            with self.assertRaises(ValueError):
                Account(platform="instagram", handle=value)
