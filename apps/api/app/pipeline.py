import json
from collections import defaultdict
from datetime import datetime, timezone

from app.agents import AnalysisAgents
from app.metrics import (
    account_metrics,
    local_comparison,
    trend_metrics,
    viral_candidates,
)
from app.models import Content, deduplicate
from app.oriane import Oriane
from app.queries import account_query, discovery_query, market_query
from app.schemas import BenchmarkRequest, DiscoveryRequest, MarketRequest
from app.settings import Settings
from app.store import ControlledError, Store


def error_body(error: ControlledError) -> dict:
    return {"code": error.code, "message": error.message}


def in_window(contents: list[Content], window) -> list[Content]:
    return [
        item
        for item in contents
        if item.published_at is not None
        and window.start_at <= item.published_at < window.end_at
    ]


def top_evidence(contents: list[Content], limit: int) -> list[Content]:
    usable = [item for item in deduplicate(contents) if item.texts]
    return sorted(
        usable,
        key=lambda item: (item.views is None, -(item.views or 0), item.source_id),
    )[:limit]


def market_selections(
    records: list[dict], contents: list[Content], min_creators: int
) -> dict:
    lookup = {item.source_id: item for item in contents}
    formats, products = defaultdict(list), []
    for record in records:
        source = lookup.get(record["source_id"])
        if source is None:
            continue
        for item in record["formats"]:
            formats[item["label"].casefold()].append((source, item))
        for item in record["products"]:
            products.append(
                {
                    **item,
                    "source_id": source.source_id,
                    "restaurant_account_handle": source.handle,
                    "platform": source.platform,
                    "published_at": source.published_at.isoformat(),
                    "observed_at": source.fetched_at.isoformat(),
                    "announced_launch_at": None,
                    "limitations": [
                        "Novelty is source-reported, not independent proof of a launch."
                    ],
                }
            )
    repeated = []
    for label, observations in formats.items():
        sources = {source.source_id for source, _ in observations}
        creators = {
            (source.platform, source.handle)
            for source, _ in observations
            if source.handle
        }
        if len(sources) >= 2 and len(creators) >= min_creators:
            repeated.append(
                {
                    "label": label,
                    "supporting_distinct_contents": len(sources),
                    "supporting_distinct_creators": len(creators),
                    "observations": [item for _, item in observations],
                    "source_ids": sorted(sources),
                    "limitations": [
                        "Spoken/on-screen narrative only; no visual editing analysis.",
                        "Repetition does not establish effectiveness.",
                    ],
                }
            )
    products.sort(
        key=lambda item: (
            item["novelty_status"] != "announced_launch",
            item["source_id"],
        )
    )
    return {
        "repeatable_formats": sorted(
            repeated, key=lambda item: -item["supporting_distinct_contents"]
        )[:3],
        "product_opportunities": products[:3],
    }


class Pipeline:
    def __init__(
        self,
        settings: Settings,
        store: Store,
        adapter_factory=Oriane,
        agent_factory=AnalysisAgents,
    ):
        self.settings, self.store = settings, store
        self.adapter_factory, self.agent_factory = adapter_factory, agent_factory

    def run(self, job: dict) -> dict:
        payload = json.loads(job["payload"])
        request_type = {
            "benchmark": BenchmarkRequest,
            "market": MarketRequest,
            "discovery": DiscoveryRequest,
        }[job["kind"]]
        request = request_type.model_validate(payload)
        include_llm = getattr(request, "include_llm", False)
        try:
            self.settings.require_providers(include_llm)
        except ValueError as error:
            raise ControlledError("PROVIDER_NOT_CONFIGURED", str(error)) from error
        adapter = self.adapter_factory(self.settings, self.store, job["id"])
        try:
            if job["kind"] == "discovery":
                response = adapter.search(
                    "profiles",
                    discovery_query(request),
                    limit=request.limit,
                    projection="full",
                    sort="followersCount:desc",
                )
                profiles = []
                for row in response["payload"]["data"]["results"]:
                    if row.get("platform") not in request.platforms or not row.get(
                        "handle"
                    ):
                        continue
                    profiles.append(
                        {
                            key: row.get(key)
                            for key in (
                                "id",
                                "platform",
                                "platformId",
                                "handle",
                                "displayName",
                                "bio",
                                "followersCount",
                                "locationCompleteAddress",
                                "locationLatitude",
                                "locationLongitude",
                            )
                        }
                    )
                return {
                    "kind": "discovery",
                    "candidates": profiles,
                    "fetched_at": response["fetched_at"],
                    "confirmed": False,
                    "warnings": [],
                    "limitations": [
                        "Confirm establishment, branch, category and account identity before benchmarking.",
                        "Discovery is bounded and not a complete local directory.",
                    ],
                }
            if job["kind"] == "benchmark":
                return self.benchmark(job["id"], request, adapter)
            return self.market(job["id"], request, adapter)
        finally:
            adapter.close()

    def ai(self, identity: str, request, report: dict, contents: list[Content]) -> dict:
        if not request.include_llm:
            report["ai"] = {
                "availability": "not_requested",
                "actions": [],
                "observations": [],
            }
            return report
        self.store.phase(identity, "extracting")
        agents = self.agent_factory(self.settings, self.store, identity)
        records, warnings = [], []
        try:
            records, warnings = agents.extract(contents)
            report["warnings"].extend(warnings)
            self.store.phase(identity, "synthesizing")
            facts = {
                key: value
                for key, value in report.items()
                if key not in {"sources", "ai", "own_accounts", "competitor_accounts"}
            }
            for key in ("own_accounts", "competitor_accounts"):
                if key in report:
                    facts[key] = [
                        {
                            **row,
                            "metrics": {
                                name: value
                                for name, value in row["metrics"].items()
                                if name != "top_posts"
                            },
                        }
                        for row in report[key]
                    ]
            synthesis = agents.recommend(
                facts,
                contents,
                getattr(request, "goals", []),
                getattr(request, "constraints", []),
            )
            report["ai"] = {
                "availability": "available",
                "observations": records,
                **synthesis,
            }
        except ControlledError as error:
            if error.code == "CANCELLED":
                raise
            report["warnings"].append(error.code)
            report["ai"] = {
                "availability": "partial" if records else "unavailable",
                "observations": records,
                "actions": [],
                "error": error_body(error),
            }
        finally:
            agents.close()
        return report

    def benchmark(
        self, identity: str, request: BenchmarkRequest, adapter: Oriane
    ) -> dict:
        own, competitors, sources, evidence, warnings, coverage = [], [], [], [], [], []
        for index, restaurant in enumerate(
            [request.own_restaurant, *request.competitors]
        ):
            for account in restaurant.accounts:
                self.store.phase(identity, "collecting")
                try:
                    collection = adapter.collect(
                        account_query(account, request.window),
                        request.contents_per_account,
                    )
                    filtered = in_window(collection.contents, request.window)
                    filtered = [
                        item
                        for item in filtered
                        if item.platform == account.platform
                        and item.handle == account.handle
                    ]
                    if len(filtered) != len(collection.contents):
                        collection.complete = False
                        collection.warnings.append(
                            "SCOPE_MISMATCH_OR_UNKNOWN_DATE_EXCLUDED"
                        )
                    warnings.extend(collection.warnings)
                    metric = account_metrics(
                        filtered, request.window, request.timezone, collection.complete
                    )
                    coverage.append(
                        {
                            "restaurant": restaurant.name,
                            "platform": account.platform,
                            "handle": account.handle,
                            **collection.coverage(),
                        }
                    )
                    sources.extend(filtered)
                    evidence.extend(
                        top_evidence(
                            filtered,
                            len(filtered) if request.analyze_all_collected else 2,
                        )
                    )
                except ControlledError as error:
                    if error.code == "CANCELLED":
                        raise
                    warnings.append(error.code)
                    metric = account_metrics(
                        [], request.window, request.timezone, False
                    )
                    coverage.append(
                        {
                            "restaurant": restaurant.name,
                            "platform": account.platform,
                            "handle": account.handle,
                            "error": error_body(error),
                        }
                    )
                row = {
                    "restaurant": restaurant.name,
                    "platform": account.platform,
                    "handle": account.handle,
                    "metrics": metric,
                }
                (own if index == 0 else competitors).append(row)
        self.store.phase(identity, "aggregating")
        report = {
            "kind": "benchmark",
            "method_version": "owned-account.v1",
            "benchmark_scope": request.benchmark_scope,
            "configuration_snapshot": request.model_dump(mode="json"),
            "own_accounts": own,
            "competitor_accounts": competitors,
            "local_comparison": local_comparison(own, competitors)
            if request.benchmark_scope == "local_confirmed"
            else [],
            "peer_comparison": local_comparison(own, competitors),
            "coverage": coverage,
            "warnings": sorted(set(warnings)),
            "sources": [item.public() for item in deduplicate(sources)],
            "limitations": [
                "Only confirmed restaurant-owned accounts are measured; third-party mentions are excluded.",
                "Competitor identity/location is user-confirmed, not verified account ownership.",
            ],
        }
        if request.benchmark_scope == "brand_accounts":
            report["limitations"].append(
                "Brand-account comparison: declared Paris context does not isolate a Paris branch or local competitors."
            )
        return self.ai(identity, request, report, deduplicate(evidence))

    def market(self, identity: str, request: MarketRequest, adapter: Oriane) -> dict:
        corpora, coverages, warnings = {}, [], []
        platforms = list(dict.fromkeys(request.platforms))
        quotient, remainder = divmod(request.contents_per_window, len(platforms))
        targets = {
            platform: quotient + (index < remainder)
            for index, platform in enumerate(platforms)
        }
        for name, window in (
            ("current", request.current),
            ("previous", request.previous),
        ):
            for platform in platforms:
                self.store.phase(identity, "collecting")
                scoped = request.model_copy(update={"platforms": [platform]})
                try:
                    collection = adapter.collect(
                        market_query(scoped, window), targets[platform]
                    )
                    contents = [
                        item
                        for item in in_window(collection.contents, window)
                        if item.platform == platform
                    ]
                    if len(contents) != len(collection.contents):
                        collection.complete = False
                        collection.warnings.append(
                            "SCOPE_MISMATCH_OR_UNKNOWN_DATE_EXCLUDED"
                        )
                    corpora[(name, platform)] = (contents, collection.complete)
                    warnings.extend(collection.warnings)
                    coverages.append(
                        {"window": name, "platform": platform, **collection.coverage()}
                    )
                except ControlledError as error:
                    if error.code == "CANCELLED":
                        raise
                    corpora[(name, platform)] = ([], False)
                    warnings.append(error.code)
                    coverages.append(
                        {
                            "window": name,
                            "platform": platform,
                            "error": error_body(error),
                        }
                    )
        recent_indexing = (datetime.now(timezone.utc) - request.current.end_at).days < 7
        if recent_indexing:
            warnings.append("RECENT_WINDOW_INDEXING_PROVISIONAL")
        self.store.phase(identity, "aggregating")
        trends, sources, evidence, current_contents = [], [], [], []
        for platform in platforms:
            now, now_complete = corpora[("current", platform)]
            before, before_complete = corpora[("previous", platform)]
            trends.extend(
                {"platform": platform, **row}
                for row in trend_metrics(
                    now,
                    before,
                    request.current,
                    request.previous,
                    [*request.category_terms, *request.topics],
                    [],
                    request.min_sources,
                    request.min_creators,
                    now_complete and before_complete and not recent_indexing,
                )
            )
            sources.extend([*now, *before])
            current_contents.extend(now)
            evidence.extend(
                top_evidence(now, len(now) if request.analyze_all_collected else 4)
                + top_evidence(
                    before, len(before) if request.analyze_all_collected else 4
                )
            )
        report = {
            "kind": "market",
            "method_version": "france-sector.v1",
            "configuration_snapshot": request.model_dump(mode="json"),
            "coverage": coverages,
            "trends": trends,
            "provisional": recent_indexing,
            "viral_candidates": viral_candidates(
                current_contents, request.viral_views_per_follower
            ),
            "warnings": sorted(set(warnings)),
            "sources": [item.public() for item in deduplicate(sources)],
            "limitations": [
                "France means metropolitan bounding box plus provider-declared France address.",
                "Geography can be content or author location; it does not establish audience geography.",
                "Sources missing usable geography/language are excluded, creating selection bias.",
                "Trend labels require complete matched queries, not a representative national sample.",
                "Thresholds are exploratory: +/-20% rate change, configured source and creator minima.",
            ],
        }
        report = self.ai(identity, request, report, deduplicate(evidence))
        records = report.get("ai", {}).get("observations", [])
        report.update(
            market_selections(records, current_contents, request.min_creators)
        )
        extracted_ids = {record["source_id"] for record in records}
        report["product_trends"] = []
        for platform in platforms:
            now, now_complete = corpora[("current", platform)]
            before, before_complete = corpora[("previous", platform)]
            extraction_complete = all(
                item.source_id in extracted_ids for item in [*now, *before]
            )
            report["product_trends"].extend(
                {
                    "platform": platform,
                    "extraction_complete": extraction_complete,
                    "basis": "observed_product_mentions_in_analyzed_sources",
                    **row,
                }
                for row in trend_metrics(
                    now,
                    before,
                    request.current,
                    request.previous,
                    [],
                    records,
                    request.min_sources,
                    request.min_creators,
                    now_complete
                    and before_complete
                    and extraction_complete
                    and not recent_indexing,
                )
                if row["topic"].startswith("product:")
            )
        report["product_trend_limitations"] = (
            "Products are extracted from selected evidence, not a complete product census."
        )
        return report
