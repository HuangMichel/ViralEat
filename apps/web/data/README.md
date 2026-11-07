# Data for the website

`niche_poulet-croustillant_links.json`: links-only export of the niche study on crispy chicken
(TikTok/Instagram, French-language or France-located content, last 90 days at 2026-11-07, 50 most-viewed
relevant posts out of 80 fetched).

Each post has its `post_url`, author, observed views, publication date, linked restaurant profiles and
marketing/restaurant concepts. Each pattern lists the `post_urls` supporting it.

- It contains **no third-party text** (no captions, transcripts, comments, bios) and no thumbnails.
  Link to the posts rather than republishing their content.
- `post_url` is rebuilt from platform ids; Oriane does not return post URLs.
- Views are observed counters on the most-viewed collected posts, not unique people, visits or sales.
- Regenerate with `apps/api/scripts/niche_study.py` (see `apps/api/README.md`); copy the `_links.json` file here.
