import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function pick(row, fields) {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
}
function list(value, map) {
  return (value ?? []).map(map);
}
function observation(row) {
  return {
    ...pick(row, ["title", "description", "topic", "label", "platform", "status", "availability", "metric", "own_value", "local_median", "competitor_count", "relative_difference_percent", "basis", "current_count", "previous_count", "distinct_creators", "current_posts_per_day", "previous_posts_per_day", "growth_percent", "abstention_reason", "source_id", "source_ids", "observation", "hypothesis", "proposed_action", "effort", "outcome_measure", "constraints_to_check", "limitations", "price_amount", "currency", "novelty_status", "published_at", "observed_at", "announced_launch_at", "views", "followers", "views_per_follower_ratio", "supporting_distinct_contents", "supporting_distinct_creators", "format"]),
    evidence: list(row.evidence, item => pick(item, ["source_id", "channel"])),
  };
}
function account(row) {
  return {
    ...pick(row, ["restaurant", "platform", "handle"]),
    metrics: pick(row.metrics ?? {}, ["content_count", "mean_views", "median_views", "mean_engagement_views_percent", "posts_per_week", "sampled_posts_per_week", "posting_rate_basis", "complete_provider_query", "limitations"]),
  };
}
function report(row) {
  if (row == null) return null;
  const config = row.configuration_snapshot ?? {};
  const ai = row.ai ?? {};
  return {
    ...pick(row, ["kind", "method_version", "benchmark_scope", "analysis_id", "warnings", "limitations", "product_trend_limitations"]),
    configuration_snapshot: {
      ...pick(config, ["window", "current", "previous", "goals", "constraints", "target_customers", "category_terms", "benchmark_scope"]),
      own_restaurant: config.own_restaurant ? {
        ...pick(config.own_restaurant, ["name"]),
        accounts: list(config.own_restaurant.accounts, row => pick(row, ["platform", "handle"])),
      } : null,
    },
    own_accounts: list(row.own_accounts, account),
    competitor_accounts: list(row.competitor_accounts, account),
    coverage: list(row.coverage, item => ({
      ...pick(item, ["restaurant", "platform", "handle", "window", "retained_unique_contents", "provider_matched_total", "complete_provider_query", "warnings"]),
      pages: list(item.pages, page => pick(page, ["fetched_at"])),
    })),
    ...Object.fromEntries(["peer_comparison", "trends", "viral_candidates", "repeatable_formats", "product_opportunities"].map(key => [key, list(row[key], observation)])),
    sources: list(row.sources, item => pick(item, ["source_id", "platform", "handle", "external_url", "published_at", "fetched_at", "followers", "views", "format"])),
    ai: {
      ...pick(ai, ["availability", "limitations"]),
      error: ai.error ? pick(ai.error, ["code", "message"]) : null,
      actions: list(ai.actions, observation),
      observations: list(ai.observations, row => pick(row, ["source_id", "limitations"])),
    },
  };
}

/** Public projection: exclude captions, comments, media, bios and raw provider responses. */
export function prepareStudy(study) {
  return {
    ...pick(study, ["title", "generated_at", "warnings", "limitations"]),
    selection_basis: {
      ...pick(study.selection_basis ?? {}, ["source", "scope_approval", "peer_relevance", "local_branch_verified"]),
      profiles: list(study.selection_basis?.profiles, row => pick(row, ["platform", "handle", "displayName", "followersCount"])),
    },
    analyses: list(study.analyses, row => ({
      ...pick(row, ["kind", "analysis_id", "status", "created_at", "oriane_requests", "actual_llm_tokens", "sources", "ai_availability", "actions", "warnings"]),
      error: row.error ? pick(row.error, ["code", "message"]) : null,
    })),
    benchmark: report(study.benchmark),
    market: report(study.market),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = new URL("../../../examples/tasty-crousty/study_output.json", import.meta.url);
  const destination = new URL("../public/data/study_output.json", import.meta.url);
  const study = JSON.parse(await readFile(source, "utf8"));
  await writeFile(destination, `${JSON.stringify(prepareStudy(study), null, 2)}\n`);
  console.log("Prepared public/data/study_output.json from examples/tasty-crousty.");
}
