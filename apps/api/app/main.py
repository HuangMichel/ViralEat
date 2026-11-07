import hmac
import json
import re
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.schemas import BenchmarkRequest, DiscoveryRequest, MarketRequest
from app.settings import Settings
from app.store import ControlledError, Store


def create_app(settings: Settings | None = None, store: Store | None = None) -> FastAPI:
    settings = settings or Settings.load()
    store = store or Store(settings.database)
    app = FastAPI(
        title="ViralEat local analysis runner",
        version="0.1.0",
        description="Local-only analysis API. Not the hosted /v1 tenant API.",
    )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"]
    )

    @app.middleware("http")
    async def local_boundary(request: Request, call_next):
        request.state.request_id = str(uuid4())
        origin = request.headers.get("origin")
        if origin and urlsplit(origin).hostname not in {
            "localhost",
            "127.0.0.1",
            "testserver",
        }:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "ORIGIN_FORBIDDEN",
                        "message": "Local origins only",
                    }
                },
            )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def envelope(request: Request, data):
        return {"data": data, "meta": {"request_id": request.state.request_id}}

    @app.exception_handler(ControlledError)
    async def controlled(request: Request, error: ControlledError):
        return JSONResponse(
            status_code=error.status,
            content={
                "error": {"code": error.code, "message": error.message},
                "meta": {"request_id": request.state.request_id},
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation(request: Request, error: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "INVALID_INPUT",
                    "message": "Request validation failed",
                    "fields": [
                        {"location": item["loc"], "type": item["type"]}
                        for item in error.errors()
                    ],
                },
                "meta": {"request_id": request.state.request_id},
            },
        )

    def authorize(x_viraleat_key: str | None = Header(default=None)):
        token = settings.local_token.get_secret_value()
        if not token:
            raise ControlledError(
                "LOCAL_AUTH_NOT_CONFIGURED",
                "Set LOCAL_API_TOKEN to enable analysis access",
            )
        if not x_viraleat_key or not hmac.compare_digest(
            x_viraleat_key.encode(), token.encode()
        ):
            raise ControlledError("AUTH_REQUIRED", "Valid local API key required", 401)

    @app.get("/health")
    def health(request: Request):
        return envelope(
            request,
            {
                "status": "ok",
                "mode": "local_development",
                "model": settings.model,
                "local_auth_configured": bool(settings.local_token.get_secret_value()),
                "oriane_configured": bool(
                    settings.oriane_key.get_secret_value() and settings.oriane_header
                ),
                "openai_configured": bool(settings.openai_key.get_secret_value()),
                "providers_verified": False,
            },
        )

    def submit(request: Request, body, kind: str, key: str | None):
        if not key or not re.fullmatch(r"[\x21-\x7e]{1,128}", key):
            raise ControlledError(
                "INVALID_IDEMPOTENCY_KEY",
                "Use a nonempty ASCII Idempotency-Key of at most 128 characters",
                400,
            )
        try:
            settings.require_providers(getattr(body, "include_llm", False))
        except ValueError as error:
            raise ControlledError("PROVIDER_NOT_CONFIGURED", str(error)) from error
        job, _ = store.create(key, kind, body.model_dump(mode="json"), settings.model)
        url = f"/local/v1/analyses/{job['id']}"
        return JSONResponse(
            status_code=202,
            headers={"Location": url, "Retry-After": "2"},
            content=envelope(
                request, {"id": job["id"], "status": job["status"], "status_url": url}
            ),
        )

    @app.post("/local/v1/discovery", dependencies=[Depends(authorize)], status_code=202)
    def discovery(
        request: Request,
        body: DiscoveryRequest,
        idempotency_key: str | None = Header(default=None),
    ):
        return submit(request, body, "discovery", idempotency_key)

    @app.post("/local/v1/benchmark", dependencies=[Depends(authorize)], status_code=202)
    def benchmark(
        request: Request,
        body: BenchmarkRequest,
        idempotency_key: str | None = Header(default=None),
    ):
        return submit(request, body, "benchmark", idempotency_key)

    @app.post("/local/v1/market", dependencies=[Depends(authorize)], status_code=202)
    def market(
        request: Request,
        body: MarketRequest,
        idempotency_key: str | None = Header(default=None),
    ):
        return submit(request, body, "market", idempotency_key)

    @app.get("/local/v1/analyses/{identity}", dependencies=[Depends(authorize)])
    def analysis(request: Request, identity: str):
        job = store.get(identity)
        return envelope(
            request,
            {
                "id": job["id"],
                "kind": job["kind"],
                "status": job["status"],
                "phase": job["phase"],
                "cancel_requested": bool(job["cancel"]),
                "usage": {
                    "oriane_requests": job["requests"],
                    "recorded_llm_tokens": job["actual_tokens"],
                    "reserved_llm_token_upper_bound": job["reserved_tokens"],
                    "oriane_credits": None,
                },
                "report": json.loads(job["report"]) if job["report"] else None,
                "error": json.loads(job["error"]) if job["error"] else None,
            },
        )

    @app.post("/local/v1/analyses/{identity}/cancel", dependencies=[Depends(authorize)])
    def cancel(request: Request, identity: str):
        store.cancel(identity)
        return envelope(
            request,
            {
                "id": identity,
                "status": store.get(identity)["status"],
                "cancel_requested": True,
            },
        )

    return app
