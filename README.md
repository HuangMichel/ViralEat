# ViralEat

ViralEat helps restaurant owners examine social content about their restaurant, competitors, and niche, then choose actions supported by sources.

## Project status

This repository contains MVP specifications and a configuration template. The applications, migrations, configuration loader, startup scripts, and deployments have not been implemented. API routes describe target contracts rather than running endpoints.

## Documentation

Each document owns the following requirements. Use links to that document instead of copying its requirements elsewhere.

| Document | Authoritative content |
| --- | --- |
| [features.md](features.md) | Product scope, workflows, user-facing behavior, and acceptance criteria |
| [architecture.md](architecture.md) | Target stack, repository layout, data model, access design, processing, provider assumptions, and operations |
| [API.md](API.md) | HTTP routes, request and response contracts, public states, and command semantics |
| [.env.example](.env.example) | Environment variable names and proposed configuration defaults |
| [agents.md](agents.md) | Development workflow and verification instructions |

Resolve conflicts against the latest user decision and update the owning document. Update dependent links or contracts when necessary.

## Prepare configuration

1. Copy [.env.example](.env.example) to an ignored local environment file for development.
2. Put only the `NEXT_PUBLIC_` settings in the frontend environment. Keep provider keys and database credentials in the backend environment.
3. Fill the required blank values from the selected Supabase and provider accounts. Confirm Oriane authentication rather than guessing its header or prefix.
4. Select an accessible OpenAI model and validate structured output support.
5. Confirm provider coverage, usage rights, pricing, and retention before real collection.
6. Configure the hosted queue, region, consumers, and maintenance schedule as specified in [architecture.md](architecture.md#12-configuration-operations-and-observability).
7. Replace development URLs and restrict CORS to the deployed frontend origins.
8. Validate required configuration before collection. Missing settings and provider failures must produce explicit errors.

Configure email/password authentication, confirmation and recovery redirects, and custom SMTP in Supabase Auth settings as described in [architecture section 4.5](architecture.md#45-email-and-password-authentication). SMTP credentials are managed there, not in the application environment.

The template uses public development URLs and blank credentials. It cannot run integrations unchanged. The local `.env` is private, ignored configuration; its contents have not been inspected. A local queue is for development and tests. It does not replace real provider data or provide production durability.

Environment variables are proposed application settings. Their presence does not configure SDKs, implement feature flags, or verify a connection. Keep real credentials out of the committed template.

## Implementation order

1. Validate actual Oriane coverage and cost for the selected restaurants and niche. Annotate a small extraction evaluation corpus.
2. Create both applications, authentication, database schema, access policies, and versioned migrations.
3. Implement one complete analysis through collection, validated extraction, and publication of a report with evidence.
4. Implement the remaining product workflows against [features.md](features.md) and the [HTTP contract](API.md).
5. Verify integrated behavior, permissions, recovery, and consumption before deployment.
6. Ask restaurant owners to evaluate whether the reports and proposed actions are useful.

Dependency files and executable commands must be added with the implementation. This repository does not yet provide installation, startup, or application test commands.

Open integration decisions and technical references are maintained in [architecture.md](architecture.md#14-open-decisions-before-provider-integration).
