"""collect -> extract + validate -> aggregate -> synthesize -> publish."""

import asyncio
import logging
from datetime import UTC, datetime

import openai

from . import aggregate, extract
from .config import ConfigError, Settings
from .extract import ExtractionError, Extractor
from .models import Analysis, BenchmarkRequest, Coverage, Report, Source
from .oriane import OrianeClient, OrianeError, market_query, restaurant_query
from .store import Store
from .synthesize import synthesize

log = logging.getLogger("viraleat.pipeline")
LOW_COVERAGE = 20


def plan_queries(req) -> tuple[dict[str, str], dict[str, set[str]], list[dict]]:
    """Returns (restaurants id->name, restaurant id->handles, Oriane search bodies)."""
    platforms = list(req.platforms)
    if isinstance(req, BenchmarkRequest):
        rs = [req.restaurant, *req.competitors]
        restaurants = {f"r{i}": r.name for i, r in enumerate(rs)}
        handles = {f"r{i}": {h.lstrip("@").casefold() for h in r.handles} for i, r in enumerate(rs)}
        bodies = [restaurant_query(r.name, r.handles, platforms, query_name=f"r{i}", languages=req.languages,
                                  country=req.country)
                  for i, r in enumerate(rs)]
        return restaurants, handles, bodies
    return {}, {}, [market_query([req.niche, *req.topics], req.city, platforms, languages=req.languages, country=req.country)]


async def run(analysis: Analysis, settings: Settings, store: Store) -> None:
    oriane = None
    try:
        settings.require()
        req = analysis.request
        oriane, extractor = OrianeClient(settings), Extractor(settings)
        restaurants, handles, queries = plan_queries(req)
        per_query = max(1, settings.max_contents // len(queries))

        # 1. collect (deduplicated by platform:platform_id)
        sources: dict[str, Source] = {}
        for q in queries:
            for s in await oriane.search(q, per_query):
                sources.setdefault(s.id, s)
            analysis.progress.collected = len(sources)
            store.save_analysis(analysis)

        # 2. extract + validate quotes
        analysis.progress.phase = "extracting"
        store.save_analysis(analysis)
        sem = asyncio.Semaphore(settings.extraction_concurrency)
        failed = 0

        async def one(s: Source):
            nonlocal failed
            async with sem:
                try:
                    v = extract.validate(s, await extractor.extract(s, restaurants), restaurants)
                except (ExtractionError, openai.APIError) as exc:
                    log.warning("extraction failed for %s: %s", s.id, type(exc).__name__)
                    failed += 1
                    return None
                analysis.progress.extracted += 1
                return s, v

        results = [r for r in await asyncio.gather(*(one(s) for s in sources.values())) if r]

        # 3. attribution + aggregation
        analysis.progress.phase = "aggregating"
        evidence, products, aspects, hooks, rejected, rejected_prices = {}, [], [], {}, 0, 0
        for s, v in results:
            # Provider metadata: author is the restaurant account, or the content tags its handle.
            seen = set(s.mentioned_handles) | ({s.author_handle.casefold()} if s.author_handle else set())
            by_handle = {rid for rid, hs in handles.items() if hs & seen}
            s.restaurant_ids = sorted(v.restaurant_ids | by_handle)
            evidence.update({e.id: e for e in v.evidence})
            products += v.products
            aspects += v.aspects
            rejected += v.rejected_quotes
            rejected_prices += v.rejected_prices
            if v.hook_evidence_id:
                hooks[s.id] = v.hook_evidence_id
        for s in sources.values():
            store.save_source(s)

        warnings = []
        if len(sources) < LOW_COVERAGE:
            warnings.append(f"Low coverage: {len(sources)} contents collected.")
        all_sources = list(sources.values())
        report = Report(
            kind=req.kind, created_at=datetime.now(UTC), model=settings.openai_model,
            prompt_version=extract.PROMPT_VERSION,
            coverage=Coverage(collected=len(sources), extracted=len(results), extraction_failed=failed,
                              quotes_rejected=rejected, prices_rejected=rejected_prices, warnings=warnings),
            restaurants=restaurants, evidence=evidence, products=products,
            aspects=aggregate.aspect_counts(aspects),
            top_contents=aggregate.top_contents(all_sources),
            repeatable_formats=aggregate.repeatable_formats(all_sources, hooks),
            product_opportunities=aggregate.product_opportunities(products, sources),
        )
        if restaurants:
            report.stats = aggregate.restaurant_stats(all_sources, restaurants, list(req.platforms))
            report.price_comparison = aggregate.price_comparison(products, sources, restaurants)
            # Append to the report's own list: Pydantic copied `warnings` at construction.
            for rid, name in restaurants.items():
                if not any(s.content_count for s in report.stats if s.restaurant_id == rid):
                    report.coverage.warnings.append(f"No content attributed to {name} in this collection.")

        # 4. synthesis
        analysis.progress.phase = "synthesizing"
        store.save_analysis(analysis)
        goals = getattr(req, "goals", [])
        constraints = getattr(req, "constraints", [])
        report.opportunities = await synthesize(extractor, report, goals, constraints)

        analysis.report = report
        analysis.status = "done"
        analysis.progress.phase = "finished"
    except (ConfigError, OrianeError) as exc:
        analysis.status, analysis.error = "failed", str(exc)
    except openai.APIError as exc:
        analysis.status, analysis.error = "failed", f"OpenAI error: {type(exc).__name__}"
    except Exception:
        log.exception("analysis %s crashed", analysis.id)
        analysis.status, analysis.error = "failed", "Internal error (see server logs)."
    finally:
        if oriane:
            await oriane.aclose()
        analysis.finished_at = datetime.now(UTC)
        store.save_analysis(analysis)
