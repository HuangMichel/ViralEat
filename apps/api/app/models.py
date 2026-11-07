from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote


def timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        return None


def counter(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    import math

    return float(value) if math.isfinite(value) and value >= 0 else None


@dataclass
class Content:
    source_id: str
    provider_id: str
    platform: str
    platform_id: str | None
    handle: str
    profile_id: str | None
    format: str
    published_at: datetime | None
    fetched_at: datetime
    views: float | None
    interactions: float | None
    followers: float | None
    engagement_views_percent: float | None
    engagement_followers_percent: float | None
    texts: dict[str, str] = field(default_factory=dict)
    hashtags: list[str] = field(default_factory=list)
    media: list[dict[str, Any]] = field(default_factory=list)
    audio_id: str | None = None
    audio_title: str | None = None
    external_url: str | None = None
    likes: float | None = None
    shares: float | None = None
    comments: float | None = None
    audio_author: str | None = None
    audio_type: str | None = None
    audio_copyrighted: bool | None = None

    def public(self) -> dict[str, Any]:
        data = asdict(self)
        for name in ("published_at", "fetched_at"):
            value = data[name]
            data[name] = value.isoformat() if value else None
        return data


def normalize(raw: dict[str, Any], fetched_at: datetime) -> Content:
    platform = raw.get("platform")
    provider_id = raw.get("id")
    if platform not in {"instagram", "tiktok", "youtube"} or not provider_id:
        raise ValueError("Provider content is missing a supported platform or identity")
    platform_id = raw.get("platformId")
    source_id = f"{platform}:{platform_id or provider_id}"
    texts = {}
    for key in ("title", "caption"):
        if isinstance(raw.get(key), str) and raw[key]:
            texts[key] = raw[key]
    media = raw.get("media") or []
    for index, item in enumerate(media):
        for key in ("caption", "transcript", "onScreenText"):
            if isinstance(item.get(key), str) and item[key]:
                texts[f"media.{index}.{key}"] = item[key]
        for segment_index, chunk in enumerate(item.get("transcriptChunks") or []):
            if isinstance(chunk.get("text"), str) and chunk["text"]:
                texts[f"media.{index}.chunk.{segment_index}"] = chunk["text"]
    for index, comment in enumerate(raw.get("popularComments") or []):
        if isinstance(comment.get("content"), str) and comment["content"]:
            texts[f"comment.{index}"] = comment["content"]
    handle = str(raw.get("profileHandle") or "").lstrip("@").casefold()
    external_url = None
    if platform_id:
        encoded = quote(str(platform_id), safe="")
        if platform == "instagram":
            external_url = f"https://www.instagram.com/p/{encoded}/"
        elif platform == "youtube":
            external_url = f"https://www.youtube.com/watch?v={encoded}"
        elif handle:
            external_url = (
                f"https://www.tiktok.com/@{quote(handle, safe='')}/video/{encoded}"
            )
    interactions = counter(raw.get("interactionsCount"))
    views = counter(raw.get("viewsCount"))
    followers = counter(raw.get("profileFollowersCount"))
    return Content(
        source_id=source_id,
        provider_id=str(provider_id),
        platform=platform,
        platform_id=str(platform_id) if platform_id else None,
        handle=handle,
        profile_id=raw.get("profileId"),
        format=str(raw.get("format") or "unknown"),
        published_at=timestamp(raw.get("publishedAt")),
        fetched_at=fetched_at,
        views=views,
        interactions=interactions,
        followers=followers,
        engagement_views_percent=100 * interactions / views
        if views and interactions is not None
        else None,
        engagement_followers_percent=100 * interactions / followers
        if followers and interactions is not None
        else None,
        texts=texts,
        hashtags=[
            str(tag.get("name") or tag.get("value") or "")
            if isinstance(tag, dict)
            else str(tag)
            for tag in raw.get("hashtags") or []
        ],
        media=media,
        audio_id=raw.get("audioPlatformId"),
        audio_title=raw.get("audioTitle"),
        external_url=external_url,
        likes=counter(raw.get("likesCount")),
        shares=counter(raw.get("sharesCount")),
        comments=counter(raw.get("commentsCount")),
        audio_author=raw.get("audioAuthor"),
        audio_type=raw.get("audioType"),
        audio_copyrighted=raw.get("audioCopyrighted")
        if isinstance(raw.get("audioCopyrighted"), bool)
        else None,
    )


def deduplicate(contents: list[Content]) -> list[Content]:
    return list({content.source_id: content for content in contents}.values())
