"""JSON-file storage. Good enough for a single-process hackathon backend."""

from pathlib import Path

from .models import Analysis, Source


class Store:
    def __init__(self, root: Path):
        self.analyses = root / "analyses"
        self.sources = root / "sources"
        self.analyses.mkdir(parents=True, exist_ok=True)
        self.sources.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _write(path: Path, text: str) -> None:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(text)
        tmp.replace(path)

    def save_analysis(self, a: Analysis) -> None:
        self._write(self.analyses / f"{a.id}.json", a.model_dump_json())

    def get_analysis(self, analysis_id: str) -> Analysis | None:
        path = self.analyses / f"{analysis_id}.json"
        return Analysis.model_validate_json(path.read_text()) if path.exists() else None

    def list_analyses(self) -> list[Analysis]:
        items = [Analysis.model_validate_json(p.read_text()) for p in self.analyses.glob("*.json")]
        return sorted(items, key=lambda a: a.created_at, reverse=True)

    def save_source(self, s: Source) -> None:
        self._write(self.sources / f"{s.id.replace(':', '_')}.json", s.model_dump_json())

    def get_source(self, source_id: str) -> Source | None:
        path = self.sources / f"{source_id.replace(':', '_')}.json"
        return Source.model_validate_json(path.read_text()) if path.exists() else None
