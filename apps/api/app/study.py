import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from app.exports import export_analysis
from app.schemas import BenchmarkRequest, MarketRequest, StrictModel
from app.settings import Settings
from app.store import ControlledError, Store, fingerprint
from app.worker import process_job


class StudyPlan(StrictModel):
    title: str
    selection_basis: dict
    benchmark: BenchmarkRequest
    market: MarketRequest


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )
    temporary.replace(path)


def prepare_tasty_crousty(store: Store, destination: Path) -> Path:
    discovery_ids = [
        "be5eb0a4-b668-4bf2-835a-21cf9c539f56",
        "9a27ea49-074e-4ec1-a36b-99e10286abc0",
    ]
    profiles = {}
    for identity in discovery_ids:
        report = json.loads(store.get(identity)["report"] or "{}")
        for profile in report.get("candidates", []):
            if profile["platform"] == "instagram":
                profiles[profile["handle"]] = profile
    handles = [
        "tastycrousty",
        "kroustysabaidi.fr",
        "croustyone_france",
        "croustygame",
        "kroustyfactory.officiel",
    ]
    if any(handle not in profiles for handle in handles):
        raise ControlledError(
            "IDENTITY_NOT_RESOLVED",
            "Study accounts must exist in the saved provider discovery",
        )

    def restaurant(handle):
        profile = profiles[handle]
        return {
            "name": profile["displayName"],
            "accounts": [
                {"platform": "instagram", "handle": handle, "confirmed": True}
            ],
        }

    plan = StudyPlan.model_validate(
        {
            "title": "Tasty Crousty: brand-account benchmark and French sector monitoring",
            "selection_basis": {
                "source": "real Oriane profile discovery",
                "discovery_analysis_ids": discovery_ids,
                "profiles": [profiles[handle] for handle in handles],
                "scope_approval": "User approved brand-account comparison instead of a Paris-branch benchmark",
                "peer_relevance": "Restaurant brands associated with crousty/krousty; menu equivalence is a hypothesis, not proven",
                "local_branch_verified": False,
            },
            "benchmark": {
                "own_restaurant": restaurant(handles[0]),
                "competitors": [restaurant(handle) for handle in handles[1:]],
                "benchmark_scope": "brand_accounts",
                "analyze_all_collected": True,
                "area": {
                    "city": "Paris",
                    "min_latitude": 48.8,
                    "max_latitude": 48.9,
                    "min_longitude": 2.2,
                    "max_longitude": 2.5,
                },
                "category_terms": ["crousty", "krousty"],
                "window": {
                    "start_at": "2026-10-01T00:00:00Z",
                    "end_at": "2026-10-30T00:00:00Z",
                },
                "goals": [
                    "Compare observed social-account performance and identify evidence-backed content experiments"
                ],
                "constraints": [
                    "Example is a brand-account study, not a local Paris restaurant measurement",
                    "Production capacity, margins and customer demographics are unknown",
                ],
                "contents_per_account": 100,
                "include_llm": True,
            },
            "market": {
                "category_terms": ["crousty", "krousty"],
                "topics": ["nouveau", "menu", "sauce", "poulet", "riz"],
                "current": {
                    "start_at": "2026-10-16T00:00:00Z",
                    "end_at": "2026-10-30T00:00:00Z",
                },
                "previous": {
                    "start_at": "2026-09-18T00:00:00Z",
                    "end_at": "2026-10-16T00:00:00Z",
                },
                "platforms": ["instagram", "tiktok"],
                "contents_per_window": 100,
                "analyze_all_collected": True,
                "include_llm": True,
            },
        }
    )
    path = destination / "study_plan.json"
    write_json(path, plan.model_dump(mode="json"))
    return path


def run_study(
    plan: StudyPlan, settings: Settings, destination: Path, processor=process_job
) -> dict:
    settings.require_providers(True)
    store = Store(settings.database)
    summaries = []
    write_json(destination / "study_plan.json", plan.model_dump(mode="json"))
    for kind in ("benchmark", "market"):
        request = getattr(plan, kind)
        payload = request.model_dump(mode="json")
        key = f"study-{kind}-{fingerprint(payload)}"
        job, created = store.create(key, kind, payload, settings.model)
        print(f"Study stage: {kind}; job={job['id']}; new={created}", flush=True)
        if created:
            claimed = store.claim()
            if claimed is None or claimed["id"] != job["id"]:
                raise ControlledError(
                    "WORKER_BUSY", "The local worker has not made this job available"
                )
            processor(claimed, settings, store)
        directory = export_analysis(store, job["id"], destination)
        state = store.get(job["id"])
        report = json.loads(state["report"]) if state["report"] else None
        summary = {
            "kind": kind,
            "analysis_id": job["id"],
            "status": state["status"],
            "export_directory": directory.name,
            "oriane_requests": state["requests"],
            "actual_llm_tokens": state["actual_tokens"],
            "sources": len(report.get("sources", [])) if report else 0,
            "ai_availability": report.get("ai", {}).get("availability")
            if report
            else None,
            "actions": len(report.get("ai", {}).get("actions", [])) if report else 0,
            "warnings": report.get("warnings", []) if report else [],
            "error": json.loads(state["error"]) if state["error"] else None,
        }
        summaries.append(summary)
        write_json(
            destination / "study_output.json",
            {
                "title": plan.title,
                "selection_basis": plan.selection_basis,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "analyses": summaries,
                "benchmark": report if kind == "benchmark" else previous_benchmark,
                "market": report if kind == "market" else None,
                "limitations": [
                    "A complete export is not complete market coverage or a Paris-branch measurement."
                ],
            },
        )
        if kind == "benchmark":
            previous_benchmark = report
        print(json.dumps(summary, ensure_ascii=True), flush=True)
    return {"analyses": summaries, "output": str(destination / "study_output.json")}


def main():
    parser = argparse.ArgumentParser(
        description="Run and export both real restaurant analysis workflows"
    )
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--prepare-tasty-crousty", action="store_true")
    parser.add_argument("--oriane-bearer", action="store_true")
    arguments = parser.parse_args()
    settings = Settings.load()
    if arguments.oriane_bearer:
        settings = settings.model_copy(
            update={"oriane_header": "Authorization", "oriane_scheme": "Bearer"}
        )
    destination = (
        arguments.output or settings.database.parent / "exports" / "tasty-crousty-study"
    )
    if arguments.prepare_tasty_crousty:
        path = prepare_tasty_crousty(Store(settings.database), destination)
        print(f"Prepared real-profile study plan: {path}")
        return
    if arguments.plan is None:
        parser.error("Provide --plan or --prepare-tasty-crousty")
    plan = StudyPlan.model_validate_json(arguments.plan.read_text(encoding="utf-8"))
    print(json.dumps(run_study(plan, settings, destination), ensure_ascii=True))


if __name__ == "__main__":
    main()
