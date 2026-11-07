import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.models import Content, deduplicate, normalize
from app.settings import Settings
from app.store import ControlledError, Store, fingerprint


class ProviderMedia(BaseModel):
    model_config = ConfigDict(extra="allow")
    transcript: str | None = None
    caption: str | None = None
    onScreenText: str | None = None
    transcriptChunks: list[dict[str, Any]] | None = None
    frames: list[dict[str, Any]] | None = None


class ProviderContent(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    platform: Literal["instagram", "tiktok", "youtube"]
    platformId: str | None = None
    profileHandle: str | None = None
    media: list[ProviderMedia] | None = None
    popularComments: list[dict[str, Any]] | None = None
    hashtags: list[Any] | None = None


class ProviderData(BaseModel):
    results: list[dict[str, Any]]


class ProviderPagination(BaseModel):
    offset: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    totalCount: int = Field(ge=0)
    aiSearchAnchor: str | None = None


class ProviderMetadata(BaseModel):
    pagination: ProviderPagination
    timestamp: str | int | None = None


class SearchPage(BaseModel):
    data: ProviderData
    metadata: ProviderMetadata


@dataclass
class Collection:
    contents: list[Content] = field(default_factory=list)
    complete: bool = False
    matched_total: int | None = None
    warnings: list[str] = field(default_factory=list)
    pages: list[dict] = field(default_factory=list)

    def coverage(self) -> dict:
        return {
            "retained_unique_contents": len(self.contents),
            "provider_matched_total": self.matched_total,
            "complete_provider_query": self.complete,
            "warnings": self.warnings,
            "pages": self.pages,
        }


class Oriane:
    def __init__(self, settings: Settings, store: Store, job_id: str, transport=None):
        self.settings, self.store, self.job_id = settings, store, job_id
        value = (
            f"{settings.oriane_scheme} {settings.oriane_key.get_secret_value()}".strip()
        )
        self.client = httpx.Client(
            base_url="https://connect.oriane.xyz",
            timeout=settings.oriane_timeout,
            headers={settings.oriane_header: value},
            transport=transport,
            follow_redirects=False,
        )

    def close(self):
        self.client.close()

    def search(
        self,
        endpoint: str,
        body: dict,
        *,
        limit: int,
        offset: int = 0,
        projection: str = "basic",
        sort: str = "publishedAt:desc",
        anchor: str | None = None,
    ) -> dict:
        if endpoint not in {"contents", "profiles"}:
            raise ValueError("Unsupported search endpoint")
        self.store.check_cancel(self.job_id)
        params = {
            "limit": limit,
            "offset": offset,
            "projection": projection,
            "sort": sort,
        }
        if anchor:
            params["aiSearchAnchor"] = anchor
        key = fingerprint(
            {
                "account": fingerprint(self.settings.oriane_key.get_secret_value()),
                "endpoint": endpoint,
                "body": body,
                "params": params,
            }
        )
        cached = self.store.cached(key)
        if cached:
            self.store.artifact(
                self.job_id,
                "oriane",
                {
                    "endpoint": f"/rest/{endpoint}/search",
                    "parameters": params,
                    "query": body,
                    **cached,
                    "cache_hit": True,
                },
            )
            return {**cached, "cache_hit": True}
        self.store.reserve(self.job_id, "oriane", 1, self.settings.request_limit)
        try:
            response = self.client.post(
                f"/rest/{endpoint}/search", params=params, json=body
            )
            fetched_at = datetime.now(timezone.utc).isoformat()
            try:
                received = response.json()
            except ValueError:
                received = {
                    "unparsed_body": response.text[:200000],
                    "body_truncated": len(response.text) > 200000,
                }
            serialized = json.dumps(received, ensure_ascii=True)
            for secret in (self.settings.oriane_key, self.settings.openai_key):
                value = secret.get_secret_value()
                if value:
                    serialized = serialized.replace(value, "[REDACTED]")
            payload = json.loads(serialized)
            self.store.artifact(
                self.job_id,
                "oriane",
                {
                    "endpoint": f"/rest/{endpoint}/search",
                    "parameters": params,
                    "query": body,
                    "payload": payload,
                    "http_status": response.status_code,
                    "fetched_at": fetched_at,
                    "cache_hit": False,
                },
            )
            if response.status_code not in {200, 206}:
                status = response.status_code
                code = (
                    "PROVIDER_AUTH_FAILED"
                    if status in {401, 403}
                    else (
                        "PROVIDER_CREDITS_EXHAUSTED"
                        if status == 402
                        else "PROVIDER_REQUEST_FAILED"
                    )
                )
                raise ControlledError(
                    code, f"Oriane returned HTTP {status}; no automatic paid retry"
                )
            SearchPage.model_validate(payload)
        except ValidationError as error:
            fields = ", ".join(
                ".".join(str(part) for part in item["loc"]) for item in error.errors()
            )
            raise ControlledError(
                "PROVIDER_SCHEMA_INVALID",
                f"Oriane response contract mismatch at: {fields}",
            ) from error
        except ValueError as error:
            raise ControlledError(
                "PROVIDER_SCHEMA_INVALID", "Oriane returned an invalid search response"
            ) from error
        except httpx.HTTPError as error:
            raise ControlledError(
                "PROVIDER_UNAVAILABLE",
                "Oriane call failed; billing outcome may be unknown",
            ) from error
        result = {
            "payload": payload,
            "fetched_at": fetched_at,
            "cache_hit": False,
        }
        self.store.cache(key, result, self.settings.cache_seconds)
        return result

    def collect(self, body: dict, target: int) -> Collection:
        result, offset = Collection(), 0
        while len(result.contents) < target:
            try:
                response = self.search(
                    "contents",
                    body,
                    limit=min(100, target - len(result.contents)),
                    offset=offset,
                    projection="full",
                )
            except ControlledError as error:
                if error.code == "CANCELLED" or not result.contents:
                    raise
                result.warnings.append(error.code)
                break
            page = SearchPage.model_validate(response["payload"])
            pagination = page.metadata.pagination
            if pagination.offset != offset:
                result.warnings.append("PROVIDER_OFFSET_MISMATCH")
                break
            result.matched_total = pagination.totalCount
            before = len(result.contents)
            for raw in page.data.results:
                try:
                    validated = ProviderContent.model_validate(raw).model_dump()
                    result.contents.append(
                        normalize(
                            validated, datetime.fromisoformat(response["fetched_at"])
                        )
                    )
                except (ValidationError, ValueError, TypeError, AttributeError):
                    result.warnings.append("MALFORMED_CONTENT_EXCLUDED")
            result.contents = deduplicate(result.contents)
            result.pages.append(
                {
                    "offset": offset,
                    "returned": len(page.data.results),
                    "fetched_at": response["fetched_at"],
                    "cache_hit": response["cache_hit"],
                    "projection": "full",
                }
            )
            offset += len(page.data.results)
            if offset >= pagination.totalCount:
                result.complete = not result.warnings
                break
            if not page.data.results or len(result.contents) == before:
                result.warnings.append("PAGINATION_STALLED")
                break
        if not result.complete:
            result.warnings.append("INCOMPLETE_PROVIDER_QUERY")
        return result
