"""SYNTHETIC test data only: fictional restaurants and posts, never application data."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from viraleat_api import aggregate
from viraleat_api.extract import validate
from viraleat_api.models import (
    ContentExtraction, ExtractedAspect, ExtractedMention, ExtractedProduct, ExtractedQuote, Metrics, Source,
)

NOW = datetime(2026, 11, 7, tzinfo=UTC)
RESTAURANTS = {"r0": "Synthetic Burger", "r1": "Fake Smash"}


def src(i: int, views: int | None, author: str = "creator_a", audio: str | None = None) -> Source:
    return Source(id=f"tiktok:fake{i}", platform="tiktok", platform_id=f"fake{i}", fetched_at=NOW,
                  author_handle=author, caption="Le menu burger chez Fake Smash à 12 euros",
                  transcript="Honnêtement le pain est trop sec", comments=["ça a l'air incroyable"],
                  metrics=Metrics(views=views), audio_id=audio)


def test_ungrounded_quotes_are_rejected():
    s = src(1, 100)
    ext = ContentExtraction(
        mentions=[ExtractedMention(name_as_mentioned="Fake Smash", restaurant_id="r1",
                                   evidence=[ExtractedQuote(channel="caption", quote="chez Fake Smash")])],
        products=[ExtractedProduct(label="menu burger", price_amount="12.00", currency="EUR",
                                   novelty="none_stated", restaurant_id="r1",
                                   evidence=[ExtractedQuote(channel="caption", quote="menu burger INVENTED")])],
        aspects=[ExtractedAspect(aspect="quality", polarity="negative", speaker_type="creator",
                                 experience_basis="reported_experience", restaurant_id="r1",
                                 evidence=[ExtractedQuote(channel="transcript", quote="le pain est  trop sec")])],
        hook=None,
    )
    v = validate(s, ext, RESTAURANTS)
    assert v.restaurant_ids == {"r1"}
    assert v.products == []  # invented quote -> dropped
    assert len(v.aspects) == 1  # whitespace/case normalized match
    assert v.rejected_quotes == 1


def test_unknown_restaurant_id_is_not_attributed():
    s = src(1, 100)
    ext = ContentExtraction(mentions=[ExtractedMention(name_as_mentioned="X", restaurant_id="r9",
                                                       evidence=[ExtractedQuote(channel="caption", quote="Fake Smash")])],
                            products=[], aspects=[], hook=None)
    assert validate(s, ext, RESTAURANTS).restaurant_ids == set()


def test_missing_views_stay_null_and_are_not_ranked():
    sources = [src(1, None), src(2, 0), src(3, 50)]
    for s in sources:
        s.restaurant_ids = ["r1"]
    top = aggregate.top_contents(sources)
    assert [t.source_id for t in top] == ["tiktok:fake3", "tiktok:fake2"]
    stats = {(x.restaurant_id, x.platform): x for x in aggregate.restaurant_stats(sources, RESTAURANTS, ["tiktok"])}
    assert stats[("r1", "tiktok")].cumulative_views == 50
    assert stats[("r1", "tiktok")].contents_with_views == 2
    assert stats[("r0", "tiktok")].cumulative_views is None  # no data, not zero
    assert stats[("r0", "tiktok")].content_count == 0


def test_format_needs_two_distinct_creators():
    one_creator = [src(1, 1, "a", "aud1"), src(2, 1, "a", "aud1")]
    assert aggregate.repeatable_formats(one_creator, {}) == []
    two = [src(1, 1, "a", "aud1"), src(2, 1, "b", "aud1")]
    assert len(aggregate.repeatable_formats(two, {})) == 1


def test_api_validation_and_missing_config(monkeypatch):
    from viraleat_api import main
    for field in ("openai_api_key", "openai_model", "oriane_api_key", "oriane_auth_header"):
        monkeypatch.setattr(main.settings, field, "")
    client = TestClient(main.app)
    r = {"name": "Synthetic Burger"}
    three = {"kind": "benchmark", "restaurant": r, "competitors": [{"name": f"c{i}"} for i in range(3)]}
    assert client.post("/analyses", json=three).status_code == 422
    dup = {**three, "competitors": [{"name": "c"}] * 4}
    assert client.post("/analyses", json=dup).status_code == 422
    four = {**three, "competitors": [{"name": f"c{i}"} for i in range(4)]}
    resp = client.post("/analyses", json=four)
    assert resp.status_code == 503 and "Missing configuration" in resp.json()["detail"]
    assert "/analyses" in client.get("/openapi.json").json()["paths"]


def test_oriane_normalize_and_auth():
    from viraleat_api.oriane import auth_value, normalize
    assert auth_value("Bearer", "k") == "Bearer k" and auth_value("", "k") == "k"
    item = {  # SYNTHETIC item shaped like the Oriane FullBody schema
        "id": "cnt_fake", "platform": "tiktok", "platformId": "123", "profileHandle": "fake_creator",
        "publishedAt": "2026-10-01T12:00:00.000Z", "caption": "Menu chez Fake Smash", "viewsCount": None,
        "likesCount": 10, "commentsCount": 0, "audioPlatformId": "aud1", "locationCompleteAddress": None,
        "mentions": [{"profileHandle": "FakeSmash"}],
        "media": [{"type": "video", "transcript": "trop bon", "onScreenText": ["MENU 12€"], "tags": []}],
        "popularComments": [{"platformId": "c1", "content": "j'y vais demain"}],
    }
    s = normalize(item)
    assert s.id == "tiktok:123" and s.url is None
    assert s.post_url == "https://www.tiktok.com/@fake_creator/video/123"  # rebuilt, provider url stays None
    assert normalize({**item, "platform": "instagram", "platformId": "DcFake_1"}).post_url == "https://www.instagram.com/p/DcFake_1/"
    assert s.metrics.views is None and s.metrics.comments == 0  # null stays null, zero stays zero
    assert s.on_screen_text == "MENU 12€" and s.mentioned_handles == ["fakesmash"]
    assert normalize({**item, "platformId": None}) is None


def test_price_must_appear_in_grounded_quote():
    from viraleat_api.extract import amount_in_quotes
    assert amount_in_quotes("5.50", ["CROUSTY DAILY A 5,50€"])
    assert amount_in_quotes("9.00", ["pour le mastodonte à 9€"])
    assert amount_in_quotes("12.50", ["menu à 12€50"])
    assert not amount_in_quotes("7.00", ["CROUSTY DAILY A 5,50€"])
    s = src(1, 100)  # caption: "Le menu burger chez Fake Smash à 12 euros"
    ext = ContentExtraction(mentions=[], aspects=[], hook=None, products=[
        ExtractedProduct(label="menu burger", price_amount="15.00", currency="EUR", novelty="none_stated",
                         restaurant_id="r1", evidence=[ExtractedQuote(channel="caption", quote="menu burger")])])
    v = validate(s, ext, RESTAURANTS)
    assert v.products[0].price_amount is None and v.rejected_prices == 1  # product kept, invented price dropped


def test_price_comparison_requires_attributed_content():
    from viraleat_api.models import ProductObservation
    a, b = src(1, 10), src(2, 10)
    a.restaurant_ids = ["r1"]  # b is not attributed to any restaurant
    def prod(s, rid, amount):
        return ProductObservation(source_id=s.id, restaurant_id=rid, evidence_ids=["e"], label="Menu burger",
                                  price_amount=amount, currency="EUR", novelty="none_stated")
    table = aggregate.price_comparison(
        [prod(a, "r1", "12.00"), prod(a, "r1", "12.00"), prod(b, "r1", "9.00"), prod(a, "r1", None)],
        {a.id: a, b.id: b}, RESTAURANTS)
    by = {t.restaurant_id: t for t in table}
    assert by["r0"].status == "no_price_observed" and by["r0"].rows == []  # listed, not dropped
    assert [r.amount for r in by["r1"].rows] == ["12.00"]  # deduplicated; unattributed source excluded


def test_niche_pattern_support_needs_two_creators():
    from viraleat_api.niche import PostRecord, concept_stats
    def rec(i, author, views):
        return PostRecord(source=src(i, views, author), about_restaurant_food=True, restaurant_handles=[],
                          unlinked_restaurant_names=[], author_is_restaurant=False, marketing_concepts=["prank_or_skit"],
                          restaurant_concepts=[], evidence_ids=[], hook_evidence_id=None)
    same = concept_stats([rec(1, "a", 10), rec(2, "a", None)], "marketing_concepts", {})
    assert same[0].support_ok is False and same[0].total_views == 10 and same[0].median_views == 10
    two = concept_stats([rec(1, "a", 10), rec(2, "b", 30)], "marketing_concepts", {})
    assert two[0].support_ok is True and two[0].median_views == 20
