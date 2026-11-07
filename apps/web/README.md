# ViralEat frontend

The restaurant profile, creator profiles, and analytics overview implement the approved [Profile studio prototype](../../design/prototypes/profile-studio.html). This application uses Next.js, React, and TypeScript. The screens read reports and source records from the hackathon backend.

## Run locally

Use Node.js 24.22.0, recorded in [.nvmrc](.nvmrc).

```sh
cd apps/web
nvm use
npm ci
npm run dev
```

Open `http://localhost:3000`. The frontend connects to `https://viral-eat-api-mu.vercel.app` by default. No authentication is implemented by the hackathon API.

| Route | Purpose |
| --- | --- |
| `/` or `/dashboard/` | Collection scope, platform comparisons, analysis status, and source evidence |
| `/restaurant/` | Declared restaurant context, profile editor, and original report context |
| `/creators/` | Creator account details, evidence, and saved selection |

## Current data connection

The application reads `GET /analyses` and the report's referenced `GET /sources/{id}` records through a typed gateway. It shows the latest analysis, with the last available report for the same request when a newer run is pending or failed. Running analyses refresh every five seconds. **Refresh data** reloads completed reports or discovers a new analysis.

The backend's [hackathon scope](../api/HACKATHON.md) and [implemented models](../api/src/viraleat_api/models.py) define this connection. The root API document describes a future service and does not match these routes. The connection does not start paid analyses.

To use another backend, set `NEXT_PUBLIC_API_BASE_URL` before starting or building Next.js. See [.env.example](.env.example). For a local backend, use `http://localhost:8000` without `/v1`. The backend must allow the frontend origin in `CORS_ORIGINS`. This is a public URL, not a place for credentials.

Restaurant context comes from the analysis request. Creator accounts come from sources referenced by the report; they are not a complete creator directory. Missing measurements and profile fields remain unavailable. Sources are linked to their original posts; only brief evidence quotes are displayed. The API has no profile-editing or creator-selection endpoints, so these controls remain disabled. No changes are claimed to be saved.

The reusable [WorkspaceProvider](src/lib/workspace-context.tsx) still accepts an injected [WorkspaceGateway](src/lib/workspace-types.ts) for isolated tests. [ConnectedWorkspace](src/lib/connected-workspace.tsx) supplies the real adapter to all application routes. Loading, empty, failure, unavailable-source, and partial-report states remain explicit.

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

Backend connection verification used Node 24.22.0. Type checking, all 34 tests, and the production static export passed. The build used an exact source copy in a clean temporary directory because this sandbox denied removal of the existing `.next/diagnostics` directory. The generated export was copied to `out/`.

Adapter tests use synthetic HTTP responses. They cover benchmark and market reports, null-versus-zero values, matching-request fallback, missing sources, platform separation, runtime validation, bounded source concurrency, and cancellation. Component tests cover API failure/retry and polling without hiding the current report. These tests do not prove real service persistence.

On 7 November 2026, browser requests to the configured deployed backend's `/health`, `/analyses`, and `/openapi.json` returned HTTP 500 with `FUNCTION_INVOCATION_FAILED`. Live data and deployed schema verification remain blocked. The sandbox also denied starting a local preview server (`listen EPERM`), so browser verification of the changed frontend did not run. The prior visual refinement checks used isolated synthetic data; they do not establish backend integration.

Source reads are limited to four concurrent requests. Each running-analysis refresh rereads the referenced sources of the last available report; this is acceptable for the bounded hackathon corpus, but it is not optimized for a large report history.
