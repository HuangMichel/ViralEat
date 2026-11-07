import re
from collections import defaultdict
from statistics import mean, median
from zoneinfo import ZoneInfo

from app.models import Content, deduplicate
from app.schemas import Window


def average(values: list[float | None]) -> float | None:
    known = [value for value in values if value is not None]
    return mean(known) if known else None


def account_metrics(
    contents: list[Content], window: Window, timezone: str, complete: bool
) -> dict:
    contents = deduplicate(
        [
            item
            for item in contents
            if item.published_at is not None
            and window.start_at <= item.published_at < window.end_at
        ]
    )
    views = [item.views for item in contents if item.views is not None]
    weeks = (window.end_at - window.start_at).total_seconds() / (7 * 86400)
    formats = defaultdict(list)
    hours = defaultdict(list)
    for item in contents:
        formats[item.format].append(item)
        hours[item.published_at.astimezone(ZoneInfo(timezone)).hour].append(item)
    format_rows = {
        name: {
            "count": len(items),
            "views_available_count": sum(item.views is not None for item in items),
            "mean_views": average([item.views for item in items]),
            "engagement_views_percent": average(
                [item.engagement_views_percent for item in items]
            ),
        }
        for name, items in formats.items()
    }
    eligible_formats = {
        name: row
        for name, row in format_rows.items()
        if row["mean_views"] is not None and row["views_available_count"] >= 2
    }
    best = (
        max(eligible_formats, key=lambda name: eligible_formats[name]["mean_views"])
        if eligible_formats
        else None
    )
    return {
        "content_count": len(contents),
        "views_available_count": len(views),
        "mean_views": mean(views) if views else None,
        "median_views": median(views) if views else None,
        "mean_engagement_views_percent": average(
            [item.engagement_views_percent for item in contents]
        ),
        "mean_engagement_followers_percent": average(
            [item.engagement_followers_percent for item in contents]
        ),
        "engagement_available_count": sum(
            item.engagement_views_percent is not None for item in contents
        ),
        "posts_per_week": len(contents) / weeks if complete else None,
        "sampled_posts_per_week": len(contents) / weeks,
        "posting_rate_basis": "indexed_account_posts"
        if complete
        else "truncated_sample_only",
        "complete_provider_query": complete,
        "format_metrics": format_rows,
        "best_observed_format": best,
        "publication_hours": {
            str(hour): {
                "count": len(items),
                "mean_views": average([item.views for item in items]),
            }
            for hour, items in sorted(hours.items())
        },
        "timezone": timezone,
        "top_posts": [
            item.public()
            for item in sorted(
                [item for item in contents if item.views is not None],
                key=lambda item: (-item.views, item.source_id),
            )[:5]
        ],
        "limitations": [
            "Provider indexing is not a complete account export.",
            "Publication-hour associations do not prove an optimal posting time.",
            "Cumulative views depend on post age; compare like windows and platforms.",
        ],
    }


def local_comparison(own: list[dict], competitors: list[dict]) -> list[dict]:
    comparisons = []
    for row in own:
        for metric in (
            "mean_views",
            "median_views",
            "mean_engagement_views_percent",
            "posts_per_week",
        ):
            peers = [
                item["metrics"][metric]
                for item in competitors
                if item["platform"] == row["platform"]
                and item["metrics"]["complete_provider_query"]
                and item["metrics"][metric] is not None
            ]
            local_median = median(peers) if len(peers) >= 2 else None
            value = row["metrics"][metric]
            comparable = (
                row["metrics"]["complete_provider_query"]
                and value is not None
                and local_median is not None
            )
            comparisons.append(
                {
                    "platform": row["platform"],
                    "metric": metric,
                    "own_value": value,
                    "local_median": local_median,
                    "competitor_count": len(peers),
                    "relative_difference_percent": 100 * (value / local_median - 1)
                    if comparable and value is not None and local_median
                    else None,
                    "basis": "confirmed_selected_competitors_not_entire_local_market",
                    "availability": "available" if comparable else "insufficient_data",
                }
            )
    return comparisons


def viral_candidates(contents: list[Content], threshold: float) -> list[dict]:
    rows = []
    for item in deduplicate(contents):
        if item.format != "video" or item.views is None or not item.followers:
            continue
        ratio = item.views / item.followers
        if ratio >= threshold:
            rows.append(
                {
                    "source_id": item.source_id,
                    "platform": item.platform,
                    "external_url": item.external_url,
                    "views": item.views,
                    "followers": item.followers,
                    "views_per_follower_ratio": ratio,
                    "published_at": item.published_at.isoformat()
                    if item.published_at
                    else None,
                    "fetched_at": item.fetched_at.isoformat(),
                    "basis": "views_relative_to_observed_followers_not_measured_acceleration",
                }
            )
    return sorted(
        rows, key=lambda row: (-row["views_per_follower_ratio"], row["source_id"])
    )[:10]


def normalized_term(value: str) -> str:
    return " ".join(value.strip().lstrip("#").casefold().split())


def topic_membership(
    contents: list[Content], terms: list[str], extracted: list[dict]
) -> dict[str, set[str]]:
    groups = defaultdict(set)
    for item in deduplicate(contents):
        for tag in item.hashtags:
            tag = normalized_term(tag)
            if tag:
                groups[f"hashtag:{tag}"].add(item.source_id)
        text = " ".join(
            value
            for channel, value in item.texts.items()
            if not channel.startswith("comment.")
        )
        for term in terms:
            cleaned = normalized_term(term)
            if cleaned and re.search(
                r"(?<!\w)" + re.escape(cleaned) + r"(?!\w)", text.casefold()
            ):
                groups[f"keyword:{cleaned}"].add(item.source_id)
    valid_ids = {item.source_id for item in contents}
    for record in extracted:
        if record["source_id"] in valid_ids:
            for product in record.get("products", []):
                groups[f"product:{normalized_term(product['label'])}"].add(
                    record["source_id"]
                )
    return groups


def trend_metrics(
    current: list[Content],
    previous: list[Content],
    current_window: Window,
    previous_window: Window,
    terms: list[str],
    extracted: list[dict],
    min_sources: int,
    min_creators: int,
    complete: bool,
) -> list[dict]:
    current, previous = deduplicate(current), deduplicate(previous)
    current_groups = topic_membership(current, terms, extracted)
    previous_groups = topic_membership(previous, terms, extracted)
    lookup = {item.source_id: item for item in [*current, *previous]}
    days_now = (current_window.end_at - current_window.start_at).total_seconds() / 86400
    days_before = (
        previous_window.end_at - previous_window.start_at
    ).total_seconds() / 86400
    results = []
    for label in sorted(set(current_groups) | set(previous_groups)):
        now_ids, before_ids = current_groups[label], previous_groups[label]
        creators = {
            (lookup[source].platform, lookup[source].handle)
            for source in now_ids | before_ids
            if lookup[source].handle
        }
        now_rate, before_rate = len(now_ids) / days_now, len(before_ids) / days_before
        supported = (
            complete
            and len(creators) >= min_creators
            and len(now_ids | before_ids) >= min_sources
        )
        growth = (
            100 * (now_rate / before_rate - 1) if supported and before_rate else None
        )
        status = "insufficient_data"
        if growth is not None:
            status = (
                "rising"
                if growth > 20
                else "declining"
                if growth < -20
                else "established"
            )
        results.append(
            {
                "topic": label,
                "status": status,
                "current_count": len(now_ids),
                "previous_count": len(before_ids),
                "distinct_creators": len(creators),
                "current_posts_per_day": now_rate,
                "previous_posts_per_day": before_rate,
                "growth_percent": growth,
                "current_corpus_share_percent": 100 * len(now_ids) / len(current)
                if current
                else None,
                "previous_corpus_share_percent": 100 * len(before_ids) / len(previous)
                if previous
                else None,
                "current_mean_engagement_views_percent": average(
                    [lookup[source].engagement_views_percent for source in now_ids]
                ),
                "previous_mean_engagement_views_percent": average(
                    [lookup[source].engagement_views_percent for source in before_ids]
                ),
                "formula": "100 * ((current_count/current_days)/(previous_count/previous_days)-1)",
                "abstention_reason": None
                if growth is not None
                else "zero_baseline_or_insufficient_independent_sources_or_incomplete_collection",
                "source_ids": sorted(now_ids | before_ids),
            }
        )
    return results
