# ViralEat functional specification

**Version:** 0.1  
**Date:** 2026-11-07  
**Status:** Proposed specification, pending implementation and validation. This document does not claim that these features have been delivered.

## 1. MVP objective

ViralEat helps restaurant owners understand content about their restaurant, compare it with content about four competitors, and find ideas in a broader niche. Each observation must link to its sources. Each recommendation must describe a test suited to the restaurant.

The expected result is a set of observations about the available content. The product must not present these observations as a complete measurement of the market, restaurant visits, or sales.

The proposed launch scope is Paris and one category, such as burgers or street food. This launch scope does not permanently limit the data model.

### 1.1 Two separate corpora

| Corpus | Scope | Collection budget | Use |
| --- | --- | --- | --- |
| Benchmark | The user's restaurant and four identified competitors | Proposed target of 50 to 100 usable content items per analysis across all five restaurants | Restaurant comparison and exploration of associated sources |
| Niche monitoring | An explicit category, set of topics, period, and geographic area beyond the four competitors | Separate, configurable, bounded budget. The benchmark must not silently consume it. | Notable content, observed formats, and products or offers to explore |

The target of 50 to 100 content items is a sampling objective. It guarantees neither a minimum available volume nor representativeness. An analysis with fewer sources can remain useful if its limits are visible.

The same content can belong to both corpora. Its source identity must remain unchanged. A shared total must count it only once. Each view must identify the corpus used for its figures.

### 1.2 Priorities

| Priority | Features |
| --- | --- |
| P0 required core | The seven modules below, including all three Market view tabs |
| P0 optional extension | Guided, sourced questions after validation of the main workflow |
| P1 | Social account OAuth and owner-only data, real-time updates, scheduled analyses and alerts, small chains and multiple restaurants, payments, open-ended conversational assistant |

The seven modules group product functions. They do not define seven technical services. [architecture.md](./architecture.md) defines technical responsibilities.

## 2. Users, restaurants, and declared information

The user account and the restaurant are separate objects. The account controls workspace access. The restaurant profile describes the subject of analysis. P0 can limit a workspace to one user's restaurant and four competitors without merging these objects.

Target customers, goals, and constraints are information declared by the restaurant owner. A declared student target does not prove that observed followers or customers are students.

An Instagram or TikTok link does not connect the social account. P0 uses public content actually available through authorized access. Access to owner-only statistics is a separate P1 feature.

## 3. Main workflow

1. The visitor reads the landing page and understands the proposed result and the corpus limits.
2. The visitor creates an account or signs in.
3. The user enters their restaurant, area, category, declared target customers, goals, and known constraints.
4. The user adds social account links or identifiers when available.
5. The user selects four competitors and confirms the locations when names or branches are ambiguous.
6. For niche monitoring, the user defines the category, area, period, and collection budget.
7. The user starts a benchmark or niche analysis and checks its status. These analyses can run separately. A partial result identifies the available and missing parts.
8. The user explores their restaurant, the benchmark, the Market view, and creators.
9. The user opens an observation's sources before reviewing the proposed action.
10. The user saves an action and its status. The report and action plan remain available in the workspace.

Each new analysis creates a dated result. Profile changes must not silently rewrite the parameters or conclusions of earlier analyses.

## 4. P0 modules

### F01: Landing page and user account

As a restaurant owner, I want to understand the product's value, access my workspace, and retrieve my analyses.

Functions:

- Explain the problem and the workflow of the user's restaurant, four competitors, and niche monitoring.
- Describe the report structure and show examples only when supported by real, authorized sources.
- Provide account creation and sign-in with email and password.
- Require email confirmation before the first sign-in. Provide confirmation resend, sign-out, and password recovery.
- Use email/password account access in P0. Social profile links are analysis inputs, not sign-in providers.
- Allow access only to workspaces and reports authorized for the user.

Proposed acceptance criteria:

1. The landing page identifies the intended users, required inputs, and proposed outputs.
2. Displayed figures, restaurants, results, and customer statements have real, authorized sources. The application provides no fabricated examples or simulated reports.
3. After sign-in, the user retrieves their profile, reports, creator selection, and saved actions.
4. After sign-out, this browser session no longer displays protected content or sends authenticated business requests. Backend token-expiry behavior is defined in [architecture section 4.5](architecture.md#45-email-and-password-authentication).
5. Changing an identifier does not let a user open another workspace's report.
6. Sign-in errors are visible without revealing secrets or internal technical details.
7. Sign-up explains that email confirmation is required. An unconfirmed account cannot enter the workspace. A valid confirmation lets the user complete sign-in.
8. Incorrect credentials show a generic failure. Confirmation and recovery request responses do not disclose whether an email address has an account.
9. A recovery request shows neutral confirmation. A valid recovery link lets the user set a new password; sign-in then works with the new password and rejects the old one.
10. Expired or invalid confirmation and recovery links show an error with an option to request another email. Resend and recovery controls handle rate limits without showing false delivery confirmations.

### F02: Restaurant profile and analysis of its own content

As a restaurant owner, I want comparisons and recommendations to account for my restaurant and my improvement goals.

Profile information:

- Restaurant name, address or identifiable location, city, and competitive area.
- Cuisine or restaurant category and a short description of its positioning.
- Declared target customers, such as students, workers, families, or another user-defined group.
- Goals, such as visibility, product discovery, lunch business, or another explicit objective.
- Known constraints, such as preparation capacity, available time, test budget, or menu restrictions.
- Optional Instagram and TikTok links or identifiers.
- The restaurant's price or product information, when the owner supplies it.

The profile stores information. The analysis uses available content. These functions must not create two independent analysis engines.

Proposed acceptance criteria:

1. The user can complete their profile without an Instagram or TikTok account.
2. Goals, target customers, and constraints appear as declared information. Missing information has an unknown value.
3. Adding a social identifier does not establish verified ownership or grant access to private data.
4. Restaurant-published content and third-party content about the restaurant are distinguishable when the author is identified.
5. Unavailable metrics, such as private reach or audience geography, remain unavailable. The product does not infer them from account names or declared target customers.
6. An account without usable content retains a valid profile and an explicit "No content available in this collection" state.
7. Profile changes apply to the next analysis. Earlier reports retain their original context.

### F03: Market view and niche monitoring

As a restaurant owner, I want to discover what attracts attention in my niche, understand observed formats, and find relevant product ideas.

This view is P0. It uses the niche corpus, separate from the five-restaurant benchmark. It must not present five restaurants as a representation of the whole market.

Configuration specifies the category, search topics, area, period, and collection budget. Local results and inspiration from other areas must be separate or clearly labeled. Uncertain locations remain uncertain.

#### F03-A: Viral content tab

The module distinguishes two observations:

- Cumulative counters identify the content with the most available views in the corpus at a given collection date.
- Observed growth measures changes in the same counter across at least two dated snapshots of the same content.

The tab name alone does not qualify content as viral. With one snapshot, the ranking must say "Most-viewed content in the corpus". It must not claim acceleration or measured growth.

Proposed acceptance criteria:

1. The selection contains at most ten posts. It can contain fewer posts or none.
2. Each post shows its platform, publication date, counter observation date, available metrics, and source link.
3. Comparisons account for the platform and post age. Ranking criteria and period are visible.
4. Missing views do not become zero and do not artificially determine a content item's rank.
5. Growth appears only when both snapshots refer to the same source at different dates. The observed interval is visible.
6. Views are not presented as unique people, restaurant visits, or sales.
7. The number of returned results and the collection budget do not prove complete coverage.

#### F03-B: Repeatable formats tab

The module describes observed formats, including the hook, duration, structure, scenes, on-screen text, featured product, and sound when these data are available.

A repeatable format describes a sequence that the restaurant can adapt for its own post, with production requirements. Repetition across creators does not prove commercial effectiveness.

Transcripts can support spoken statements and some hooks. They cannot establish visual editing, filmed texture, or transitions. Images, timestamps, on-screen text, and audio metadata support only what they actually show. A few still images cannot establish detailed editing pace.

Content can be grouped by sound identifier when the source provides that field. Other audio metadata can help describe the group. Without an identifier, the product cannot assert that two content items use the same sound.

Proposed acceptance criteria:

1. The selection contains at most three supported formats. It does not invent a third format to fill the screen.
2. Each format identifies its observed characteristics and supporting data. Claims of repetition cite multiple sources.
3. The repetition threshold is configurable. The proposed MVP setting is at least two distinct content items from two distinct creator accounts. This threshold establishes repetition, not effectiveness or representativeness. A single example remains labeled as such.
4. The product does not invent visual characteristics from a transcript when the available data do not show them.
5. A repeated format is not automatically described as effective. Any association with performance identifies the compared content and metrics.
6. The result proposes a possible restaurant adaptation and test conditions without guaranteeing a commercial result.

#### F03-C: New products tab

The module searches for products, recipes, ingredient combinations, seasonal offers, and set menus. Similar products can be grouped without merging products that belong to different restaurants.

| Classification | Required evidence or limit |
| --- | --- |
| Documented commercial launch | An announcement or dated source explicitly describes the launch. The claim matches the source's scope, such as one location, a chain, or a specified area. |
| Seasonal offer or seasonal return | A source identifies seasonality or the offer's return. Publication during a season is insufficient. |
| First observation in the corpus | The first detection date in retained data. This classification does not prove a launch date. |
| Unknown novelty status | Available data do not support a more precise classification. |

Proposed acceptance criteria:

1. The selection contains at most three sufficiently documented products or offers, without artificial additions.
2. Each result includes the product or set menu, restaurant, known area, sources, dates, and novelty classification.
3. Ingredients, prices, menu contents, and availability dates appear only when a source provides them.
4. A widely viewed product can be described as popular in the corpus without being described as new.
5. A first observation after a collection gap does not prove a recent launch.
6. The product indicates whether a tracked competitor also has this signal or whether it is inspiration outside the benchmark.

### F04: Competitive analysis of my restaurant and four competitors

As a restaurant owner, I want to compare content about my restaurant and four relevant competitors, then understand the observations through their evidence.

Functions include restaurant selection, confirmation of ambiguous locations, targeted collection, benchmarking, restaurant exploration, and excerpt review.

Proposed acceptance criteria:

1. The active benchmark contains the user's restaurant and four distinct competitors. The product flags location ambiguity before attributing content.
2. A collection failure for one competitor does not automatically replace that competitor with another restaurant.
3. A video that mentions several restaurants can link to each restaurant. The global video total counts it once.
4. The table separates content counts, distinct creator accounts, and cumulative views by platform. Similar names alone do not establish a shared identity across platforms.
5. Positive and negative themes include observed counts and sources. The product distinguishes creator statements, reactions to content, and reported visit experiences.
6. Every percentage shows its denominator. Neutral or mixed comments do not silently disappear from calculations.
7. Observed prices specify their coverage, such as an individual product or set menu, with a source and date.
8. An important observation lets the user open its supporting content and excerpt. A timestamp appears only when available.
9. The product does not generate visibility, quality, or value-for-money scores out of 100 without an explicit definition and calculation. P0 prioritizes observable metrics.
10. Volume differences describe the collected corpus. They do not automatically establish differences in actual awareness or sales.

### F05: Food reviewers

As a restaurant owner, I want to identify creators who cover my category and competitors, review their content, and save a selection.

Proposed acceptance criteria:

1. Each profile shows the creator account, platform, covered restaurants, associated content, and observed topics.
2. Audience and engagement counters appear only when available, with their collection context.
3. Profile location, places mentioned in content, and audience geography remain separate information.
4. Without audience geography data, the product states that this information is unknown. It does not infer a student or local audience from the restaurant profile.
5. Selection reasons are explicit and linked to content, such as covered topics, covered competitors, or observed publication area.
6. The user can add or remove a creator from their selection and retrieve that choice after signing in again.
7. P0 does not promise collaboration effectiveness or send messages to creators.

### F06: Opportunities and action plan

As a restaurant owner, I want to turn observations into a few feasible actions, understand their conditions, and track the tests I choose.

Each proposed action contains an observation, evidence, hypothesis, proposed action, estimated effort, constraints, outcome measure, and limits.

Proposed acceptance criteria:

1. An analysis proposes at most three priority actions. It shows fewer when the evidence or profile cannot support three.
2. Every observation used to recommend an action links to available evidence. Missing or excluded sources cannot remain active citations.
3. Proposed actions account for declared goals and constraints. Unknown constraints appear as conditions to check.
4. A selling price is not recommended as profitable without information about costs and operating conditions.
5. An observed competitor weakness is an opportunity hypothesis, not proof of demand or a promise of results.
6. Each action explains how to evaluate the test. Views, menu clicks, and sales remain separate metrics. Only available data can appear.
7. Action plan statuses are "To consider", "In test", and "Completed". Status changes persist, and save errors are visible.
8. Status changes do not automatically declare a successful test.

### F07: Dashboard and analysis tracking

As a restaurant owner, I want to track my analysis, understand its coverage, and retrieve its reports.

Functions include analysis launch, progress, current result, dated history, parameter review, and access to useful error information.

| Logical state | Expected presentation |
| --- | --- |
| `pending_dispatch` | Request saved, dispatch in progress |
| `queued` | Analysis waiting for processing |
| `running` | Analysis in progress, with the current stage when available |
| `succeeded` | Planned processing complete. This state does not mean complete market coverage. |
| `partial` | Usable result with identified missing parts or limits |
| `failed` | Unusable analysis, with an explanation and an appropriate retry option |
| `cancelled` | Analysis stopped. Any retained results are identified. |

These state identifiers belong to the software contract. The interface uses understandable labels. [architecture.md](./architecture.md) and [API.md](./API.md) define technical behavior, including retries and cancellation.

Proposed acceptance criteria:

1. Before collection starts, the launch flow shows the chosen corpus, scope, and budget. Benchmark and niche analyses can start separately with separate budgets.
2. A double click does not silently create two identical billable analyses.
3. The dashboard shows the actual processing state. It does not simulate a progress percentage without corresponding information.
4. Partial results identify affected restaurants, platforms, or stages. Other usable results remain available.
5. Each report retains its date, scope, parameters, and coverage. The user can distinguish the displayed report from the next analysis's parameters.
6. Failure does not erase the last valid report.
7. Save errors are visible. The product does not confirm "Saved" when state exists only temporarily in the browser.
8. Filters and summaries follow the consistency rules below.

## 5. Guided questions, optional P0 extension

This extension follows the main workflow. It is not required to validate the MVP core.

Questions can concern competitors, mentioned products, creators, criticisms, or proposed actions. Answers use the displayed report and scope.

Proposed acceptance criteria:

1. The user chooses a guided question with an explicit scope.
2. The answer uses sources within that scope and provides accessible references.
3. Insufficient data produce an explicit answer without an invented replacement conclusion.
4. An answer does not describe an observed association between content and visibility as causal.
5. Switching analyses does not retain citations that incorrectly open sources from an earlier report.

Open-ended conversation with extended history is P1.

## 6. Shared measurement and evidence rules

### 6.1 Dates and comparisons

- The publication date assigns content to a publication period.
- The collection date states when a source or metric was observed.
- The first observation date in the corpus does not replace a commercial launch date.
- A publication chart represents publications. Its title must not claim view growth.
- View growth requires multiple snapshots of the same counter. It does not measure a unique audience.
- Period comparisons show dates and volumes. Differences in coverage or collection methods are visible.
- Unknown dates must not silently become collection dates to include content in a period.

### 6.2 Filters and report consistency

Period, platform, restaurant, topic, and area filters apply to their corresponding metrics. The distinction between the benchmark and niche corpus remains visible.

A filtered report keeps figures, summaries, evidence lists, and any exports consistent. A recommendation that depends on sources outside the filter is either hidden or explicitly presented in the context of the complete report. Its references must remain connected to their sources.

A free-text content search does not silently change the meaning of a conclusion about the full corpus. The context used remains visible.

### 6.3 Reactions and experiences

The product distinguishes:

- A creator's statement in content.
- A viewer's reaction to that content.
- A visit experience reported by a viewer, without treating that report as verified.

A statement such as "That looks tempting" is not evidence of satisfaction after eating. The number of comments a source supplies does not establish that the sample represents all comments or customers.

### 6.4 Causality and recommendations

Links between restaurants, creators, content, products, and reactions describe observed relationships. They do not prove that content increased restaurant visits.

Terms such as "effective", "better", "large local audience", "profitable", and "high impact" require data that support the specific claim. Otherwise, the product presents a limited observation or a testable hypothesis.

## 7. Empty states, missing values, and partial results

| Situation | Expected behavior |
| --- | --- |
| No profile created | Restaurant creation flow, without a fabricated benchmark |
| No restaurant social account supplied | The user can continue and optionally add a link |
| Collection succeeds without content | "No content found in this collection", with its scope. No conclusion about actual lack of visibility. |
| Collection unavailable or failed | Unavailable state. Zero must not appear as an observed measurement. |
| Counter received with zero value | Show zero as the observed value |
| Counter absent | Show "Not available" or equivalent, with a data value distinct from zero |
| Ambiguous restaurant | Request location confirmation or explain the exclusion of uncertain attribution |
| Transcript or visual data missing | Limit analysis to available information. Do not invent content descriptions. |
| No supported repeated format | Explain the empty state and allow individual content exploration |
| No documented commercial launch | Use first observation or unknown status when supported. Do not invent a launch. |
| Insufficient data for an action | Show fewer recommendations with a useful explanation |
| Partial analysis | Show usable results and identify missing parts |
| Save unavailable | Show an explicit warning without a misleading persistence confirmation |
| Source removed or inaccessible | Identify its unavailability. Retain permitted context without claiming the source remains accessible. |
| Required integration missing or invalid | Show a configuration error and block the affected operation. Do not substitute fabricated data. |

## 8. Sources, access, and presentation

Collection uses authorized project access. The product retains the source identifier, platform, original link, and information needed to trace its observations.

P0 shows metadata and excerpts needed for analysis and links to original content. It does not offer full video downloads or republication.

A source's rights indicator or audio status is information from that source. It does not authorize sound reuse in a new post.

API keys do not belong in restaurant profiles or displayed reports. [architecture.md](./architecture.md), [API.md](./API.md), and [readme.md](./readme.md) define configuration locations and technical rules.

ViralEat requires real, configured integrations for authentication, storage, collection, and analysis. Missing configuration and provider failures remain visible. The application must not substitute fabricated content, citations, metrics, or reports. Synthetic fixtures are permitted only in isolated tests and cannot appear as application data.

The MVP interface is in English. Prices retain their source currency and context. Displayed dates use a context consistent with the monitored area. Main controls support keyboard use. Important states do not depend on color alone.

## 9. Proposed MVP validation conditions

Validate the MVP against the acceptance criteria in each owning section. These are checks to execute, not completed test results.

| Validation area | Authoritative criteria |
| --- | --- |
| Account access and workspace protection | [F01](#f01-landing-page-and-user-account) |
| Profile and declared information | [F02](#f02-restaurant-profile-and-analysis-of-its-own-content) |
| Market selections, formats, and product novelty | [F03](#f03-market-view-and-niche-monitoring) |
| Benchmark attribution and measurements | [F04](#f04-competitive-analysis-of-my-restaurant-and-four-competitors) |
| Saved creator selections | [F05](#f05-food-reviewers) |
| Recommendations and saved action status | [F06](#f06-opportunities-and-action-plan) |
| Launch, progress, history, and recovery presentation | [F07](#f07-dashboard-and-analysis-tracking) |
| Dates, filtering, speaker distinctions, and causal limits | [Shared rules](#6-shared-measurement-and-evidence-rules) |
| Missing data and provider failures | [Empty states](#7-empty-states-missing-values-and-partial-results) |

Run the [main workflow](#3-main-workflow) across these modules as an integration check. Technical recovery and access checks belong to [architecture.md](architecture.md#11-coverage-quality-and-evaluation); HTTP checks belong to [API.md](API.md#13-http-conformance-checks).

## 10. Outside P0 scope

- Social account OAuth and owner-only statistics.
- Guaranteed indexing or real-time monitoring.
- Automatic alerts and recurring analyses without user intervention.
- Chain and multiple-restaurant management within one operational workflow.
- Payments, subscriptions, and customer billing.
- Open-ended conversational assistant.
- Automatic creator contact or social media publication.
- Promises of return on investment, sales, or causal attribution to a creator.
- Complete coverage of a city or platform.

The MVP landing page must not claim that these features are available.

## 11. Related documents

- [agents.md](./agents.md): Working instructions and contribution rules.
- [architecture.md](./architecture.md): Technical components, responsibilities, storage, and analysis processing.
- [readme.md](./readme.md): Project overview, reading order, and planned setup.
- [API.md](./API.md): Resources, exchange contracts, states, and errors.
- [.env.example](.env.example): Configuration names and proposed defaults. Keep real keys in private environment files.
