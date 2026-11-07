import re
from datetime import datetime, timezone
from typing import Annotated, Literal
from urllib.parse import unquote, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Platform = Literal["instagram", "tiktok", "youtube"]
Term = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
DeclaredText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Window(StrictModel):
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def check(self) -> "Window":
        if not self.start_at.tzinfo or not self.end_at.tzinfo:
            raise ValueError("Dates must include a timezone")
        self.start_at = self.start_at.astimezone(timezone.utc)
        self.end_at = self.end_at.astimezone(timezone.utc)
        if self.start_at >= self.end_at or (self.end_at - self.start_at).days > 90:
            raise ValueError("Use an increasing window of at most 90 days")
        if self.end_at > datetime.now(timezone.utc):
            raise ValueError("Publication windows cannot include future dates")
        return self


class Area(StrictModel):
    city: str | None = Field(default=None, min_length=1, max_length=100)
    min_latitude: float = Field(ge=-90, le=90)
    max_latitude: float = Field(ge=-90, le=90)
    min_longitude: float = Field(ge=-180, le=180)
    max_longitude: float = Field(ge=-180, le=180)

    @model_validator(mode="after")
    def check(self) -> "Area":
        if (
            self.min_latitude >= self.max_latitude
            or self.min_longitude >= self.max_longitude
        ):
            raise ValueError("Bounding box limits must increase")
        return self

    def box(self) -> dict:
        return {
            "minLatitude": self.min_latitude,
            "maxLatitude": self.max_latitude,
            "minLongitude": self.min_longitude,
            "maxLongitude": self.max_longitude,
        }


class Account(StrictModel):
    platform: Platform
    handle: str = Field(min_length=1, max_length=100)
    confirmed: bool = False

    @model_validator(mode="after")
    def parse_handle(self) -> "Account":
        value = self.handle.strip()
        if "://" in value:
            parsed = urlsplit(value)
            expected = {
                "instagram": {"instagram.com", "www.instagram.com"},
                "tiktok": {"tiktok.com", "www.tiktok.com"},
                "youtube": {"youtube.com", "www.youtube.com"},
            }
            if (
                parsed.scheme != "https"
                or parsed.hostname not in expected[self.platform]
            ):
                raise ValueError(
                    "Use a canonical HTTPS profile URL for the selected platform"
                )
            parts = [unquote(part) for part in parsed.path.split("/") if part]
            if len(parts) != 1 or (
                self.platform in {"tiktok", "youtube"} and not parts[0].startswith("@")
            ):
                raise ValueError(
                    "Use a profile URL, not a post, shortened URL, or channel ID"
                )
            value = parts[0]
        value = value.lstrip("@").casefold()
        if not re.fullmatch(r"[a-z0-9._-]+", value) or value in {
            "p",
            "reel",
            "reels",
            "explore",
        }:
            raise ValueError("Invalid account handle")
        self.handle = value
        return self


class Restaurant(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    accounts: list[Account] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def unique_accounts(self) -> "Restaurant":
        if len({item.platform for item in self.accounts}) != len(self.accounts):
            raise ValueError("Select at most one account per platform per restaurant")
        return self


class DiscoveryRequest(StrictModel):
    category_terms: list[Term] = Field(min_length=1, max_length=10)
    area: Area
    platforms: list[Platform] = Field(
        default_factory=lambda: ["instagram", "tiktok"], min_length=1
    )
    limit: int = Field(default=20, ge=1, le=100)


class BenchmarkRequest(StrictModel):
    own_restaurant: Restaurant
    competitors: list[Restaurant] = Field(min_length=4, max_length=4)
    benchmark_scope: Literal["local_confirmed", "brand_accounts"] = "local_confirmed"
    analyze_all_collected: bool = False
    area: Area
    window: Window
    category_terms: list[Term] = Field(min_length=1, max_length=10)
    goals: list[DeclaredText] = Field(default_factory=list, max_length=10)
    constraints: list[DeclaredText] = Field(default_factory=list, max_length=10)
    timezone: str = "Europe/Paris"
    contents_per_account: int = Field(default=20, ge=1, le=100)
    include_llm: bool = True

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Use a valid IANA timezone") from error
        return value

    @model_validator(mode="after")
    def confirmed_accounts(self) -> "BenchmarkRequest":
        restaurants = [self.own_restaurant, *self.competitors]
        keys = [
            (account.platform, account.handle)
            for item in restaurants
            for account in item.accounts
        ]
        if (
            len(set(keys)) != len(keys)
            or len({item.name.casefold() for item in restaurants}) != 5
        ):
            raise ValueError(
                "Use five distinct restaurants and distinct social accounts"
            )
        if any(
            not account.confirmed for item in restaurants for account in item.accounts
        ):
            raise ValueError(
                "Confirm the account-to-establishment matches before collection"
            )
        return self


class MarketRequest(StrictModel):
    analyze_all_collected: bool = False
    category_terms: list[Term] = Field(min_length=1, max_length=10)
    topics: list[Term] = Field(default_factory=list, max_length=20)
    country_code: Literal["FR"] = "FR"
    area: Area = Field(
        default_factory=lambda: Area(
            min_latitude=41.3, max_latitude=51.2, min_longitude=-5.3, max_longitude=9.7
        )
    )
    language: Literal["fr"] = "fr"
    platforms: list[Platform] = Field(
        default_factory=lambda: ["instagram", "tiktok"], min_length=1
    )
    current: Window
    previous: Window
    contents_per_window: int = Field(default=50, ge=1, le=100)
    min_sources: int = Field(default=3, ge=2, le=20)
    min_creators: int = Field(default=2, ge=2, le=20)
    viral_views_per_follower: float = Field(default=10, ge=1, le=1000)
    include_llm: bool = True

    @model_validator(mode="after")
    def comparable_windows(self) -> "MarketRequest":
        if len(set(self.platforms)) != len(
            self.platforms
        ) or self.contents_per_window < len(self.platforms):
            raise ValueError(
                "Use distinct platforms and budget at least one content per platform"
            )
        if self.previous.end_at > self.current.start_at:
            raise ValueError(
                "The previous window must end before the current window starts"
            )
        if (self.current.end_at - self.previous.start_at).days > 90:
            raise ValueError("Both windows together must fit within 90 days")
        if not (
            41.3 <= self.area.min_latitude < self.area.max_latitude <= 51.2
            and -5.3 <= self.area.min_longitude < self.area.max_longitude <= 9.7
        ):
            raise ValueError(
                "This workflow supports metropolitan-France bounding boxes only"
            )
        return self
