# ViralEat frontend

The restaurant profile, creator profiles, and analytics overview implement the approved [Profile studio prototype](../../design/prototypes/profile-studio.html). This application uses Next.js, React, and TypeScript. The screens load a read-only study export.

## Run locally

Use Node.js 24.22.0, recorded in [.nvmrc](.nvmrc).

```sh
cd apps/web
nvm use
npm ci
npm run dev
```

Open `http://localhost:3000`. The frontend fetches `/data/study_output.json` by default, prepared from `examples/tasty-crousty/study_output.json`.

| Route | Purpose |
| --- | --- |
| `/` or `/dashboard/` | Collection scope, platform comparisons, analysis status, and source evidence |
| `/restaurant/` | Declared restaurant context, profile editor, and original report context |
| `/creators/` | Creator account details, evidence, and saved selection |

## Current data connection

The site loads a read-only `study_output.json` export. It no longer connects to the
live analysis API or starts paid analyses. Run `npm run data:prepare` to refresh the public projection from
`examples/tasty-crousty/study_output.json`, or set `NEXT_PUBLIC_STUDY_URL` to a JSON
endpoint before building. No credentials belong in this public setting.

The saved example supplies Tasty Crousty and four competitor accounts, 22 market
topics, three product opportunities, one proposed action, and 11 distinct sources.
Both analyses are partial. Posting frequency and peer medians remain unavailable;
no sample rate or invented median replaces them. Missing files show a waiting
message; invalid files show a format error. No synthetic fallback is used.
See [the export contract](data/STUDY_CONTRACT.md) for mapping, delivery and limits.

The dashboard presents account KPIs, brand comparisons, market observations,
provisional actions, analysis statuses, warnings, dates, and deduplicated sources.
Missing values remain unavailable. Restaurant and source-author profiles now use
the saved example. Restaurant editing and creator selection remain disabled. The former API adapter and its tests remain for reference, disconnected
from [ConnectedWorkspace](src/lib/connected-workspace.tsx).

## Design contract

- Retain the approved plum and lavender palette, top navigation, large profile headings, and asymmetric identity panels.
- Use four text sizes: 13px for supporting information, 16px for body text and controls, 24px for section headings, and 40px for page titles. Keep borders at 0.5px and keyboard focus outlines at 3px. Keep the supplied PNG logo unchanged.
- Keep platform measurements separate. Display unknown values explicitly and retain restaurants with missing counters in comparisons.
- Preserve publication and collection dates. Keep failed analysis status separate from the last available report.
- Resolve evidence by source and snapshot. Hide removed excerpts and links; hide observations that have no available supporting source.
- Stack profile sections on narrow screens. Keep wide comparisons in a keyboard-focusable scrolling region. Use labelled controls, visible focus indicators, a skip link, and native modal dialogs.

## Checks and build

```sh
npm run typecheck
npm test
npm run build
```

The build creates `out/` with the configured [Next.js static export](https://nextjs.org/docs/app/guides/static-exports). Serve that directory from a static host that supports directory indexes. No backend server or Next.js API route is created.

Tests use isolated synthetic fixtures and an injected gateway. They verify state ordering, mutation recovery, permissions, evidence availability, snapshot identity, and null-versus-zero presentation. JSDOM substitutes modal open/close methods; these checks do not establish native focus trapping or browser layout.

### Study export verification

On 7 November 2026, 67 synthetic tests passed (the 66-test suite plus the new
workspace recovery test). TypeScript passed on Node.js 24.22.0. A production build
of the changed source passed in a clean temporary directory and generated all six
static pages. The checkout build remains blocked by `EPERM` removing the existing
`.next/diagnostics` cache. The checked build was not deployed or copied over `out/`.

Browser layout verification could not run: the environment denied binding the
local preview server even after an escalated attempt. These checks preceded connection of the saved example; see the example integration checks below. No provider calls were made.

### Example integration checks

The saved Tasty Crousty example is now connected. On 7 November 2026, all 73 tests
passed, including original/public projection equivalence and dashboard integration
using the real saved data with substituted HTTP responses. TypeScript passed on
Node.js 24.22.0. The production build passed in a fresh temporary source copy;
its exported study JSON exactly matches `public/data/study_output.json`.
No deployment or provider request was made. Browser layout remains unverified
because the local server could not bind in this environment.

### Historical checks for the previous API connection

These checks predate the study export integration.

Backend connection verification used Node 24.22.0. Type checking, all 34 tests, and the production static export passed. The build used an exact source copy in a clean temporary directory because this sandbox denied removal of the existing `.next/diagnostics` directory. The generated export was copied to `out/`.

Adapter tests use synthetic HTTP responses. They cover benchmark and market reports, null-versus-zero values, matching-request fallback, missing sources, platform separation, runtime validation, bounded source concurrency, and cancellation. Component tests cover API failure/retry and polling without hiding the current report. These tests do not prove real service persistence.

An earlier check on 7 November 2026 found that browser requests to the configured deployed backend's `/health`, `/analyses`, and `/openapi.json` returned HTTP 500 with `FUNCTION_INVOCATION_FAILED`. The user subsequently confirmed that deployed `/docs` works. This does not verify analysis creation or completion; a live end-to-end provider check is still required. The sandbox also denied starting a local preview server (`listen EPERM`), so browser verification of the changed frontend did not run. The prior visual refinement checks used isolated synthetic data; they do not establish backend integration.

Source reads are limited to four concurrent requests. Each running-analysis refresh rereads the referenced sources of the last available report; this is acceptable for the bounded hackathon corpus, but it is not optimized for a large report history.

### Analysis submission validation

The submission flow passed 52 synthetic frontend tests and type checking on Node.js 24.22.0. The production build passed in a clean temporary source copy and generated all six static pages. Building in the checkout was blocked by a permission error removing the existing `.next/diagnostics` directory.

Tests cover benchmark and market payloads, validation, explicit POST acceptance, duplicate submission protection, selected-analysis polling, scope-matched reports, retained drafts during refresh, and recovery from ambiguous responses. They use simulated HTTP responses and gateways, not real Oriane or OpenAI calls. Independent source review found no remaining actionable defects.

Browser verification could not run because the sandbox denied listening on the local preview port (`listen EPERM`). A real backend integration check could not run: the local Python environment lacks FastAPI, and the sandbox blocked dependency downloads. Hosted creation, completion, and persistence remain unverified. No deployment or paid analysis was performed.

### Readability, video cards and profiles

The study view now starts with account statistics and proposed actions. Competitor
metrics have separate columns. Market topics show six entries initially, with an
accessible expand button. Methodology, technical warnings and detailed limits remain
available through disclosure controls. A partial-evidence notice stays visible.

Source publications appear in responsive cards with lazy Instagram/TikTok/YouTube
players where supported, dates, observed views and a permanent original-post link.
Playback depends on the platform and publication availability. The restaurant and
source-author profile routes now use the study's supplied accounts, goals, source
counts and follower observations. Brand accounts are not presented as recommended
individual creators; unknown location/audience fields remain unavailable.

Validation: 82 tests and TypeScript passed on Node.js 24.22.0. The production build
passed in a clean temporary copy. Public and original exports produce identical
profile and dashboard presentation data. Component integration uses the saved
example with substituted fetch. Browser checks were blocked by an occupied
Playwright browser profile and an unavailable computer-use browser host; shell
access to the existing localhost server was also blocked by policy. Responsive
visual rendering and actual embedded playback remain unverified. No deployment
or paid provider analysis was performed.
