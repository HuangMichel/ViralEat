"""Contract with the frontend (exposed through /openapi.json) and LLM extraction schemas."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Platform = Literal["instagram", "tiktok", "youtube"]
Channel = Literal["caption", "transcript", "on_screen_text", "comment"]
Aspect = Literal[
    "quality", "portion", "price_value", "waiting_time", "service",
    "ambience", "delivery", "presentation", "originality", "other",
]
Polarity = Literal["positive", "negative", "mixed", "neutral", "uncertain"]
SpeakerType = Literal["creator", "commenter", "restaurant_account", "unknown"]
ExperienceBasis = Literal["reported_experience", "content_reaction", "unspecified"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- requests

class RestaurantIn(Strict):
    name: str = Field(min_length=1)
    city: str = "Paris"
    district: str | None = None
    handles: list[str] = Field(default_factory=list, description="Known social handles, without @")


class BenchmarkRequest(Strict):
    kind: Literal["benchmark"]
    restaurant: RestaurantIn
    competitors: list[RestaurantIn] = Field(min_length=4, max_length=4)
    platforms: list[Platform] = Field(default_factory=lambda: ["instagram", "tiktok"], min_length=1)
    languages: list[str] = Field(default_factory=lambda: ["fr"], description="Caption or transcript language filter; [] = none")
    country: str | None = Field("France", description="Also keep content located in this country (for memes with no detected language)")
    goals: list[str] = Field(default_factory=list, description="Declared by the owner")
    constraints: list[str] = Field(default_factory=list, description="Declared by the owner")

    @field_validator("competitors")
    @classmethod
    def distinct_competitors(cls, v: list[RestaurantIn], info):
        names = [r.name.strip().lower() for r in v]
        if len(set(names)) != 4:
            raise ValueError("Select exactly four distinct competitors.")
        return v


class MarketRequest(Strict):
    kind: Literal["market"]
    niche: str = Field(min_length=1)
    city: str = "Paris"
    topics: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=lambda: ["fr"], description="Caption or transcript language filter; [] = none")
    country: str | None = Field("France", description="Also keep content located in this country (for memes with no detected language)")
    platforms: list[Platform] = Field(default_factory=lambda: ["instagram", "tiktok"], min_length=1)


AnalysisRequest = Annotated[BenchmarkRequest | MarketRequest, Field(discriminator="kind")]


# ---------------------------------------------------------------- sources

class Metrics(BaseModel):
    """`null` = not provided by the source. `0` = measured zero."""
    views: int | None = None
    likes: int | None = None
    comments: int | None = None
    shares: int | None = None


class Source(BaseModel):
    id: str = Field(description="Stable id: '<platform>:<platform_id>'")
    platform: Platform
    platform_id: str
    provider_content_id: str | None = Field(None, description="Oriane id")
    url: str | None = Field(None, description="Only when supplied by the provider (Oriane does not)")
    thumbnail_url: str | None = None
    author_handle: str | None = None
    author_followers: int | None = None
    published_at: datetime | None = None
    fetched_at: datetime
    caption: str | None = None
    transcript: str | None = None
    on_screen_text: str | None = Field(None, description="Text recognized on screen, one line per phrase")
    location: str | None = Field(None, description="Tagged location address, if any")
    mentioned_handles: list[str] = Field(default_factory=list, description="Tagged/mentioned profiles")
    audio_title: str | None = None
    comments: list[str] = Field(default_factory=list, description="Capped sample, not all comments")
    metrics: Metrics = Field(default_factory=Metrics)
    audio_id: str | None = Field(None, description="Provider audio identifier, if any")
    restaurant_ids: list[str] = Field(default_factory=list, description="Benchmark restaurants this content is attributed to")


class Evidence(BaseModel):
    id: str
    source_id: str
    channel: Channel
    quote: str


# ---------------------------------------------------------------- LLM extraction schema
# Strict structured-output schema: every field required, nullable when unknown.

class ExtractedQuote(Strict):
    channel: Channel
    quote: str = Field(description="Exact substring copied from that channel's text")


class ExtractedMention(Strict):
    name_as_mentioned: str
    restaurant_id: str | None = Field(description="Id from the provided list, or null if ambiguous/unknown")
    evidence: list[ExtractedQuote]


class ExtractedProduct(Strict):
    label: str
    price_amount: str | None = Field(description="Decimal string, only if stated in the quotes")
    currency: str | None
    novelty: Literal["announced_launch", "seasonal_offer", "none_stated"]
    restaurant_id: str | None
    evidence: list[ExtractedQuote]


class ExtractedAspect(Strict):
    aspect: Aspect
    polarity: Polarity
    speaker_type: SpeakerType
    experience_basis: ExperienceBasis
    restaurant_id: str | None
    evidence: list[ExtractedQuote]


class ContentExtraction(Strict):
    mentions: list[ExtractedMention]
    products: list[ExtractedProduct]
    aspects: list[ExtractedAspect]
    hook: ExtractedQuote | None = Field(description="Opening spoken/written line, if observable")


class ExtractedOpportunity(Strict):
    title: str
    observation: str
    hypothesis: str
    proposed_action: str
    effort: Literal["low", "medium", "high"]
    outcome_measure: str
    limitations: str
    evidence_ids: list[str]


class OpportunityList(Strict):
    opportunities: list[ExtractedOpportunity] = Field(max_length=3)


# ---------------------------------------------------------------- report

class Observation(BaseModel):
    """A validated extracted fact with its evidence."""
    source_id: str
    restaurant_id: str | None
    evidence_ids: list[str]


class ProductObservation(Observation):
    label: str
    price_amount: str | None
    currency: str | None
    novelty: Literal["announced_launch", "seasonal_offer", "none_stated"]


class AspectObservation(Observation):
    aspect: Aspect
    polarity: Polarity
    speaker_type: SpeakerType
    experience_basis: ExperienceBasis


class RestaurantStats(BaseModel):
    restaurant_id: str
    name: str
    platform: Platform
    content_count: int
    distinct_creators: int
    cumulative_views: int | None = Field(description="Sum of available view counters; null if none available")
    contents_with_views: int


class AspectCount(BaseModel):
    restaurant_id: str
    aspect: Aspect
    polarity: Polarity
    count: int
    evidence_ids: list[str]


class TopContent(BaseModel):
    rank: int
    source_id: str
    platform: Platform
    views: int
    ranking_basis: Literal["cumulative_views"] = "cumulative_views"
    fetched_at: datetime


class RepeatableFormat(BaseModel):
    audio_id: str
    platform: Platform
    supporting_contents: list[str]
    distinct_creators: int
    hooks: list[str] = Field(description="Evidence ids of observed hooks")


class ProductOpportunity(BaseModel):
    label: str
    novelty_status: Literal["announced_launch", "seasonal_offer", "first_observed"]
    first_observed_at: datetime
    supporting_contents: int
    restaurant_ids: list[str]
    prices: list[str]
    evidence_ids: list[str]


class Opportunity(ExtractedOpportunity):
    id: str


class PriceRow(BaseModel):
    """A price advertised in one content on its publication date. Not a current menu price."""
    product_label: str
    amount: str = Field(description="Decimal string, e.g. '5.50'")
    currency: str | None
    published_at: datetime | None = Field(description="Publication date of the content stating the price")
    source_id: str
    evidence_ids: list[str] = Field(description="Quotes containing the product and the amount")


class RestaurantPrices(BaseModel):
    restaurant_id: str
    name: str
    status: Literal["prices_observed", "no_price_observed"]
    rows: list[PriceRow] = Field(default_factory=list, description="Sorted by product, then date")


class Coverage(BaseModel):
    collected: int
    extracted: int
    extraction_failed: int
    quotes_rejected: int = Field(description="LLM quotes not found in the source text")
    prices_rejected: int = Field(0, description="LLM prices whose amount is absent from the cited quotes")
    warnings: list[str] = Field(default_factory=list)


class Report(BaseModel):
    kind: Literal["benchmark", "market"]
    created_at: datetime
    model: str
    prompt_version: str
    coverage: Coverage
    restaurants: dict[str, str] = Field(default_factory=dict, description="restaurant_id -> name")
    stats: list[RestaurantStats] = Field(default_factory=list)
    price_comparison: list[RestaurantPrices] = Field(default_factory=list, description="Benchmark only: one entry per selected restaurant")
    aspects: list[AspectCount] = Field(default_factory=list)
    products: list[ProductObservation] = Field(default_factory=list)
    top_contents: list[TopContent] = Field(default_factory=list, max_length=10)
    repeatable_formats: list[RepeatableFormat] = Field(default_factory=list, max_length=3)
    product_opportunities: list[ProductOpportunity] = Field(default_factory=list, max_length=3)
    opportunities: list[Opportunity] = Field(default_factory=list, max_length=3)
    evidence: dict[str, Evidence] = Field(default_factory=dict)


# ---------------------------------------------------------------- analysis

class Progress(BaseModel):
    phase: Literal["collecting", "extracting", "aggregating", "synthesizing", "finished"] = "collecting"
    collected: int = 0
    extracted: int = 0


class Analysis(BaseModel):
    id: str
    status: Literal["running", "done", "failed"]
    request: BenchmarkRequest | MarketRequest
    progress: Progress = Field(default_factory=Progress)
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None
    report: Report | None = None


class AnalysisCreated(BaseModel):
    id: str
    status: Literal["running"]
    status_url: str
