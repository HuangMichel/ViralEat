"""Oriane adapter, mapped from the public OpenAPI schema (connect.oriane.xyz/rest/docs, v0.0.1).

POST /rest/contents/search
- query string: limit (1-100), offset, projection (basic|default|full), sort ("viewsCount:desc")
- body: {operator: and|or, name?, filters?, queries?[]} with nesting depth <= 2
- text filters: {"includesExactly": {"values": [...], "operator": "or"}}
- response: {"data": {"results": [...], "aggregations": {...}}, "metadata": {...}}
The response has no publication URL: Source.url stays None.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from . import cache
from .config import Settings
from .models import Source

SEARCH_PATH = "/rest/contents/search"
PROFILES_PATH = "/rest/profiles/search"
PAGE_SIZE = 50
WINDOW_DAYS = 90  # Oriane's guide describes a ~3-month search window


class OrianeError(RuntimeError):
    pass


def auth_value(prefix: str, key: str) -> str:
    """'Bearer' + key -> 'Bearer key'. .env files strip trailing spaces, so add it here."""
    prefix = prefix.strip()
    return f"{prefix} {key}" if prefix else key


def _contains_any(terms: list[str]) -> dict[str, Any]:
    return {"includesExactly": {"values": terms, "operator": "or"}}


def _base_filters(platforms: list[str], since: date) -> dict[str, Any]:
    return {"platform": {"includes": platforms}, "publishedAt": {"after": since.isoformat()}}


def _language_group(languages: list[str], country: str | None = None) -> list[dict[str, Any]]:
    """Caption or transcript in one of the languages, OR tagged/profile location in the country.

    The location branch keeps music-only memes with no caption: Oriane detects no language for them.
    Empty languages = no filter at all.
    """
    if not languages:
        return []
    filters: dict[str, Any] = {
        "captionLanguage": {"includes": languages},
        "transcriptLanguage": {"includes": languages},
    }
    if country:
        filters["locationCompleteAddress"] = _contains_any([country])
        filters["profileLocationCompleteAddress"] = _contains_any([country])
    return [{"operator": "or", "filters": filters}]


def default_since() -> date:
    return datetime.now(UTC).date() - timedelta(days=WINDOW_DAYS)


def restaurant_query(name: str, handles: list[str], platforms: list[str], since: date | None = None,
                     query_name: str | None = None, languages: list[str] | None = None,
                     country: str | None = "France") -> dict[str, Any]:
    """Content whose caption, transcript or on-screen text contains the name, or that tags its handle."""
    match: dict[str, Any] = {
        "caption": _contains_any([name]),
        "transcript": _contains_any([name]),
        "onScreenText": _contains_any([name]),
    }
    if handles:
        clean = [h.lstrip("@") for h in handles]
        match["mentionHandles"] = {"exactMatch": {"values": clean, "operator": "or"}}
        match["profileHandle"] = {"exactMatch": {"values": clean, "operator": "or"}}
    body: dict[str, Any] = {
        "operator": "and",
        "filters": _base_filters(platforms, since or default_since()),
        "queries": [{"operator": "or", "filters": match}, *_language_group(languages or [], country)],
    }
    if query_name:
        body["name"] = query_name
    return body


def market_query(terms: list[str], city: str | None, platforms: list[str], since: date | None = None,
                 languages: list[str] | None = None, country: str | None = "France") -> dict[str, Any]:
    """Content mentioning one of the niche terms AND (if city given) located in / mentioning the city."""
    city_group = [{"operator": "or", "filters": {
        "locationCompleteAddress": _contains_any([city]),
        "profileLocationCompleteAddress": _contains_any([city]),
        "caption": _contains_any([city])}}] if city else []
    return {
        "operator": "and",
        "filters": _base_filters(platforms, since or default_since()),
        "queries": [
            {"operator": "or", "filters": {
                "caption": _contains_any(terms), "transcript": _contains_any(terms),
                "onScreenText": _contains_any(terms), "hashtags": _contains_any(terms)}},
            *city_group,
            *_language_group(languages or [], country),
        ],
    }


def profiles_by_handle_query(handles: list[str], platforms: list[str]) -> dict[str, Any]:
    return {"operator": "and", "filters": {
        "platform": {"includes": platforms},
        "handle": {"exactMatch": {"values": handles, "operator": "or"}},
    }}


def extract_items(raw: dict[str, Any]) -> list[dict[str, Any]]:
    data = raw.get("data")
    if isinstance(data, dict) and isinstance(data.get("results"), list):
        return data["results"]
    raise OrianeError(f"Unexpected search response shape, top-level keys: {sorted(raw)}")


class OrianeClient:
    def __init__(self, settings: Settings):
        settings.require()
        self.settings = settings
        self.http = httpx.AsyncClient(
            base_url=settings.oriane_base_url,
            headers={settings.oriane_auth_header: auth_value(settings.oriane_auth_prefix, settings.oriane_api_key)},
            timeout=httpx.Timeout(60.0, connect=10.0),
        )

    async def aclose(self) -> None:
        await self.http.aclose()

    async def search_profiles(self, handles: list[str], platforms: list[str]) -> list[dict[str, Any]]:
        """Profiles for these handles (exact match), batched to stay under the 500-filter-value limit."""
        out: list[dict[str, Any]] = []
        unique = sorted({h.lstrip("@").casefold() for h in handles if h})
        for i in range(0, len(unique), 100):
            batch = unique[i:i + 100]
            # API CALL: Oriane profile search, one request per 100 handles (cached).
            raw = await self.search_raw(profiles_by_handle_query(batch, platforms), limit=100,
                                        sort="followersCount:desc", path=PROFILES_PATH)
            out.extend(extract_items(raw))
        return out

    async def search_raw(self, body: dict[str, Any], *, limit: int, offset: int = 0,
                         sort: str = "viewsCount:desc", path: str = SEARCH_PATH) -> dict[str, Any]:
        params = {"limit": limit, "offset": offset, "projection": "full", "sort": sort}
        k = cache.key(path, params, body)
        if (hit := cache.get(self.settings.cache_dir, "oriane", k)) is not None:
            return hit
        for attempt in range(3):
            try:
                # API CALL: Oriane. The ONLY place an HTTP request is sent to Oriane (paid: consumes search credits). Reached only on a cache miss.
                resp = await self.http.post(path, params=params, json=body)
            except httpx.TransportError as exc:
                if attempt == 2:
                    raise OrianeError(f"Oriane unreachable: {type(exc).__name__}") from exc
                continue
            if resp.status_code in (429, 502, 503, 504) and attempt < 2:
                continue
            if resp.is_error:
                raise OrianeError(f"Oriane search failed with HTTP {resp.status_code}: {_error_summary(resp)}")
            data = resp.json()
            cache.put(self.settings.cache_dir, "oriane", k, data)
            return data
        raise OrianeError("Oriane search failed after retries")

    async def search(self, body: dict[str, Any], max_items: int) -> list[Source]:
        sources: list[Source] = []
        offset = 0
        while len(sources) < max_items:
            limit = min(PAGE_SIZE, max_items - len(sources))
            # API CALL: Oriane content search, one request per page of PAGE_SIZE results (cached).
            items = extract_items(await self.search_raw(body, limit=limit, offset=offset))
            sources.extend(s for s in (normalize(i) for i in items) if s is not None)
            if len(items) < limit:
                break
            offset += limit
        return sources[:max_items]


def _error_summary(resp: httpx.Response) -> str:
    """Validation messages only (field + rule), never the full body."""
    try:
        err = resp.json().get("error", {})
        ctx = [f"{c.get('field')}: {c.get('message')}" for c in err.get("context", [])][:5]
        return "; ".join(ctx) or str(err.get("message", ""))[:200]
    except Exception:
        return "no details"


def post_url(source: Source) -> str | None:
    """Deterministic link built from platform ids (Oriane returns none). None when it cannot be built."""
    if source.platform == "tiktok" and source.author_handle and source.platform_id.isdigit():
        return f"https://www.tiktok.com/@{source.author_handle}/video/{source.platform_id}"
    if source.platform == "instagram" and source.platform_id.replace("_", "").replace("-", "").isalnum():
        return f"https://www.instagram.com/p/{source.platform_id}/"
    if source.platform == "youtube":
        return f"https://www.youtube.com/watch?v={source.platform_id}"
    return None


def _int_or_none(v: Any) -> int | None:
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _parse_dt(v: Any) -> datetime | None:
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def normalize(item: dict[str, Any]) -> Source | None:
    platform = str(item.get("platform") or "").lower()
    platform_id = item.get("platformId")
    if platform not in ("instagram", "tiktok", "youtube") or not platform_id:
        return None  # no stable identity: drop rather than guess

    media = [m for m in item.get("media") or [] if isinstance(m, dict)]
    transcript = "\n".join(m["transcript"] for m in media if m.get("transcript"))
    on_screen = "\n".join(t for m in media for t in (m.get("onScreenText") or []) if isinstance(t, str))
    comments = [c["content"] for c in item.get("popularComments") or [] if isinstance(c, dict) and c.get("content")]
    mentions = {m.get("profileHandle", "").casefold() for m in item.get("mentions") or [] if isinstance(m, dict)}
    mentions |= {t.get("profileHandle", "").casefold() for m in media for t in m.get("tags") or [] if isinstance(t, dict)}

    source = Source(
        id=f"{platform}:{platform_id}",
        provider_content_id=item.get("id"),
        platform=platform,
        platform_id=str(platform_id),
        url=None,
        thumbnail_url=item.get("thumbnailMediaUrl"),
        author_handle=item.get("profileHandle"),
        author_followers=_int_or_none(item.get("profileFollowersCount")),
        published_at=_parse_dt(item.get("publishedAt")),
        fetched_at=datetime.now(UTC),
        caption=item.get("caption") or item.get("title"),
        transcript=transcript or None,
        on_screen_text=on_screen or None,
        comments=comments[:15],
        metrics={
            "views": _int_or_none(item.get("viewsCount")),
            "likes": _int_or_none(item.get("likesCount")),
            "comments": _int_or_none(item.get("commentsCount")),
            "shares": _int_or_none(item.get("sharesCount")),
        },
        audio_id=item.get("audioPlatformId"),
        audio_title=item.get("audioTitle"),
        location=item.get("locationCompleteAddress"),
        mentioned_handles=sorted(h for h in mentions if h),
    )
    source.post_url = post_url(source)
    return source
