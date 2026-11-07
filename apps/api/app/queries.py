from app.schemas import Account, Area, DiscoveryRequest, MarketRequest, Window


def phrases(values: list[str]) -> dict:
    return {"includesExactly": {"values": values, "operator": "or"}}


def date_filter(window: Window) -> dict:
    return {"after": window.start_at.isoformat(), "before": window.end_at.isoformat()}


def geography(area: Area, fields: tuple[str, ...]) -> dict:
    return {
        "operator": "or",
        "filters": {field: {"includes": {"values": [area.box()]}} for field in fields},
    }


def discovery_query(request: DiscoveryRequest) -> dict:
    query = {
        "operator": "and",
        "filters": {
            "platform": {"includes": request.platforms},
            "bio": phrases(request.category_terms),
            "locationCoordinates": {"includes": {"values": [request.area.box()]}},
        },
    }
    if request.area.city:
        query["filters"]["locationCompleteAddress"] = phrases([request.area.city])
    return query


def account_query(account: Account, window: Window) -> dict:
    return {
        "operator": "and",
        "filters": {
            "platform": {"includes": [account.platform]},
            "profileHandle": {"exactMatch": {"values": [account.handle]}},
            "publishedAt": date_filter(window),
        },
    }


def market_query(request: MarketRequest, window: Window) -> dict:
    terms = list(dict.fromkeys(request.category_terms))
    return {
        "operator": "and",
        "filters": {
            "platform": {"includes": request.platforms},
            "publishedAt": date_filter(window),
        },
        "queries": [
            {
                "operator": "or",
                "filters": {
                    field: phrases(terms)
                    for field in ("hashtags", "caption", "transcript", "profileBio")
                },
            },
            {
                "operator": "or",
                "filters": {
                    "captionLanguage": {"includes": [request.language]},
                    "transcriptLanguage": {"includes": [request.language]},
                },
            },
            geography(
                request.area, ("locationCoordinates", "profileLocationCoordinates")
            ),
            {
                "operator": "or",
                "filters": {
                    "locationCompleteAddress": phrases(["France"]),
                    "profileLocationCompleteAddress": phrases(["France"]),
                },
            },
        ],
    }
