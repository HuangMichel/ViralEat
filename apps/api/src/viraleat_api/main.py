from datetime import UTC, datetime
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from . import pipeline
from .config import get_settings
from .models import Analysis, AnalysisCreated, AnalysisRequest, Source
from .store import Store

settings = get_settings()
store = Store(settings.data_dir)

app = FastAPI(title="ViralEat API (hackathon)", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
def health() -> dict:
    # Reports configured, not verified: no provider call is made here.
    return {"configured": not settings.missing(), "missing": settings.missing()}


@app.post("/analyses", status_code=202, response_model=AnalysisCreated)
def create_analysis(req: AnalysisRequest, background: BackgroundTasks, response: Response) -> AnalysisCreated:
    if missing := settings.missing():
        raise HTTPException(503, f"Missing configuration: {', '.join(missing)}")
    if any(a.status == "running" for a in store.list_analyses()):
        raise HTTPException(429, "An analysis is already running.")
    analysis = Analysis(id=str(uuid4()), status="running", request=req, created_at=datetime.now(UTC))
    store.save_analysis(analysis)
    background.add_task(pipeline.run, analysis, settings, store)
    response.headers["Location"] = f"/analyses/{analysis.id}"
    return AnalysisCreated(id=analysis.id, status="running", status_url=f"/analyses/{analysis.id}")


@app.get("/analyses", response_model=list[Analysis])
def list_analyses() -> list[Analysis]:
    return store.list_analyses()


@app.get("/analyses/{analysis_id}", response_model=Analysis)
def get_analysis(analysis_id: str) -> Analysis:
    if (a := store.get_analysis(analysis_id)) is None:
        raise HTTPException(404, "Analysis not found")
    return a


@app.get("/sources/{source_id}", response_model=Source)
def get_source(source_id: str) -> Source:
    if (s := store.get_source(source_id)) is None:
        raise HTTPException(404, "Source not found")
    return s
