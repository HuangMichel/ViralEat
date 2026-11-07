import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from app.settings import Settings
from app.store import Store


def export_analysis(store: Store, identity: str, destination: Path) -> Path:
    job = store.get(identity)
    directory = destination / f"{job['kind']}-{identity}"
    directory.mkdir(parents=True, exist_ok=True)
    report = json.loads(job["report"]) if job["report"] else None
    documents = {
        "request.json": json.loads(job["payload"]),
        "report.json": report,
        "sources.json": report.get("sources", []) if report else [],
        "oriane_responses.json": store.artifacts(identity, "oriane"),
        "openai_responses.json": store.artifacts(identity, "openai"),
        "manifest.json": {
            "schema_version": "analysis-export.v1",
            "analysis_id": identity,
            "kind": job["kind"],
            "status": job["status"],
            "phase": job["phase"],
            "model": job["model"],
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.fromtimestamp(
                job["created"], timezone.utc
            ).isoformat(),
            "usage": {
                "oriane_requests": job["requests"],
                "actual_llm_tokens": job["actual_tokens"],
                "reserved_llm_tokens_upper_bound": job["reserved_tokens"],
                "oriane_credits": None,
            },
            "error": json.loads(job["error"]) if job["error"] else None,
            "data_basis": "provider_responses_recorded_for_this_analysis",
            "market_coverage_complete": False,
            "limitations": [
                "Complete export means all retained analysis artifacts, not complete platform coverage.",
                "No private provider credentials or authentication headers are exported.",
                "Retained exports must follow provider withdrawal and retention terms.",
            ],
        },
    }
    documents["manifest.json"]["files"] = list(documents)
    for filename, data in documents.items():
        temporary = directory / f"{filename}.tmp"
        temporary.write_text(
            json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False),
            encoding="utf-8",
        )
        temporary.replace(directory / filename)
    return directory


def main():
    parser = argparse.ArgumentParser(
        description="Export retained analysis data without private configuration"
    )
    parser.add_argument("analysis_id")
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    settings = Settings.load()
    directory = export_analysis(
        Store(settings.database),
        arguments.analysis_id,
        arguments.output or settings.database.parent / "exports",
    )
    print(f"Export saved: {directory}")


if __name__ == "__main__":
    main()
