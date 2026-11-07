"""Deterministic metrics. No LLM here. Missing values stay None."""

from collections import defaultdict
from datetime import UTC, datetime

from .models import (
    AspectCount, AspectObservation, PriceRow, ProductObservation, ProductOpportunity, RepeatableFormat,
    RestaurantPrices, RestaurantStats, Source, TopContent,
)

MIN_FORMAT_CONTENTS = 2
MIN_FORMAT_CREATORS = 2
NO_DATE = datetime.min.replace(tzinfo=UTC)  # sorts undated rows first


def restaurant_stats(sources: list[Source], restaurants: dict[str, str], platforms: list[str]) -> list[RestaurantStats]:
    out = []
    for rid, name in restaurants.items():  # every selected restaurant appears, even with no content
        for platform in platforms:
            subset = [s for s in sources if rid in s.restaurant_ids and s.platform == platform]
            views = [s.metrics.views for s in subset if s.metrics.views is not None]
            out.append(RestaurantStats(
                restaurant_id=rid, name=name, platform=platform,
                content_count=len(subset),
                distinct_creators=len({s.author_handle for s in subset if s.author_handle}),
                cumulative_views=sum(views) if views else None,
                contents_with_views=len(views),
            ))
    return out


def price_comparison(products: list[ProductObservation], sources: dict[str, Source],
                     restaurants: dict[str, str]) -> list[RestaurantPrices]:
    """Observed prices per selected restaurant. A price counts only when the product is attributed
    to the restaurant AND the content itself is attributed to it. No averages across products."""
    out = []
    for rid, name in restaurants.items():
        rows: dict[tuple, PriceRow] = {}
        for p in products:
            src = sources.get(p.source_id)
            if not p.price_amount or p.restaurant_id != rid or src is None or rid not in src.restaurant_ids:
                continue
            k = (" ".join(p.label.casefold().split()), p.price_amount, p.currency, p.source_id)
            rows.setdefault(k, PriceRow(product_label=p.label, amount=p.price_amount, currency=p.currency,
                                        published_at=src.published_at, source_id=p.source_id,
                                        post_url=src.post_url,
                                        evidence_ids=p.evidence_ids))
        ordered = sorted(rows.values(), key=lambda r: (r.product_label.casefold(), r.published_at or NO_DATE))
        out.append(RestaurantPrices(restaurant_id=rid, name=name,
                                    status="prices_observed" if ordered else "no_price_observed", rows=ordered))
    return out


def aspect_counts(aspects: list[AspectObservation]) -> list[AspectCount]:
    groups: dict[tuple, list[AspectObservation]] = defaultdict(list)
    for a in aspects:
        if a.restaurant_id:
            groups[(a.restaurant_id, a.aspect, a.polarity)].append(a)
    return [
        AspectCount(restaurant_id=r, aspect=asp, polarity=pol, count=len(items),
                    evidence_ids=[e for i in items for e in i.evidence_ids])
        for (r, asp, pol), items in sorted(groups.items(), key=lambda kv: -len(kv[1]))
    ]


def top_contents(sources: list[Source], n: int = 10) -> list[TopContent]:
    ranked = sorted((s for s in sources if s.metrics.views is not None),
                    key=lambda s: (-s.metrics.views, s.id))[:n]
    return [TopContent(rank=i + 1, source_id=s.id, post_url=s.post_url, platform=s.platform, views=s.metrics.views,
                       fetched_at=s.fetched_at) for i, s in enumerate(ranked)]


def repeatable_formats(sources: list[Source], hooks: dict[str, str], n: int = 3) -> list[RepeatableFormat]:
    """Group by provider audio id. Repetition = >=2 contents from >=2 distinct creators."""
    groups: dict[tuple[str, str], list[Source]] = defaultdict(list)
    for s in sources:
        if s.audio_id:
            groups[(s.platform, s.audio_id)].append(s)
    formats = []
    for (platform, audio_id), items in groups.items():
        creators = {s.author_handle for s in items if s.author_handle}
        if len(items) >= MIN_FORMAT_CONTENTS and len(creators) >= MIN_FORMAT_CREATORS:
            formats.append(RepeatableFormat(
                audio_id=audio_id, platform=platform, supporting_contents=[s.id for s in items],
                distinct_creators=len(creators), hooks=[hooks[s.id] for s in items if s.id in hooks],
            ))
    formats.sort(key=lambda f: (-f.distinct_creators, -len(f.supporting_contents)))
    return formats[:n]


def product_opportunities(products: list[ProductObservation], sources: dict[str, Source], n: int = 3) -> list[ProductOpportunity]:
    groups: dict[str, list[ProductObservation]] = defaultdict(list)
    for p in products:
        groups[" ".join(p.label.casefold().split())].append(p)
    out = []
    for items in groups.values():
        novelties = {p.novelty for p in items}
        status = ("announced_launch" if "announced_launch" in novelties
                  else "seasonal_offer" if "seasonal_offer" in novelties else "first_observed")
        out.append(ProductOpportunity(
            label=items[0].label, novelty_status=status,
            first_observed_at=min(sources[p.source_id].fetched_at for p in items),
            supporting_contents=len({p.source_id for p in items}),
            restaurant_ids=sorted({p.restaurant_id for p in items if p.restaurant_id}),
            prices=sorted({f"{p.price_amount} {p.currency or '?'}" for p in items if p.price_amount}),
            evidence_ids=[e for p in items for e in p.evidence_ids],
        ))
    out.sort(key=lambda o: (o.novelty_status == "first_observed", -o.supporting_contents))
    return out[:n]
