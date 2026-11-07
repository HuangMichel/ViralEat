"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { mutationErrorMessage } from "@/lib/workspace-errors";
import { platformLabel } from "@/lib/format";
import type { AnalysisRequest, Platform } from "@/lib/workspace-types";

const allPlatforms: Platform[] = ["instagram", "tiktok", "youtube"];

export function AnalysisForm() {
  const { state, startAnalysis, canStartAnalysis } = useWorkspace();
  const [kind, setKind] = useState<"benchmark" | "market">("benchmark");
  const [name, setName] = useState("");
  const [city, setCity] = useState("Paris");
  const [competitors, setCompetitors] = useState(["", "", "", ""]);
  const [niche, setNiche] = useState("");
  const [topics, setTopics] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([
    "instagram",
    "tiktok",
  ]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const running = state.data?.analysis?.status === "running";
  if (!canStartAnalysis || state.status !== "ready") return null;

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || running) return;
    setAccepted(false);
    if (!city.trim()) return showError("Enter a city.");
    if (!platforms.length) return showError("Select at least one platform.");
    const common = { platforms, languages: ["fr"], country: "France" };
    let input: AnalysisRequest;
    if (kind === "benchmark") {
      const names = competitors.map((value) => value.trim());
      if (!name.trim() || names.some((value) => !value))
        return showError("Enter your restaurant and all four competitors.");
      if (new Set(names.map((value) => value.toLowerCase())).size !== 4)
        return showError(
          "Enter four distinct competitor names. Names are compared without letter case or surrounding spaces.",
        );
      const restaurant = (value: string) => ({
        name: value,
        city: city.trim(),
        district: null,
        handles: [],
      });
      input = {
        ...common,
        kind,
        restaurant: restaurant(name.trim()),
        competitors: names.map(restaurant),
        goals: [],
        constraints: [],
      };
    } else {
      if (!niche.trim()) return showError("Enter a market niche.");
      input = {
        ...common,
        kind,
        niche: niche.trim(),
        city: city.trim(),
        topics: topics
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      };
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await startAnalysis(input);
      setAccepted(true);
    } catch (cause) {
      showError(mutationErrorMessage(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <details className="details analysis-start" open={!state.data.analysis}>
      <summary>Start a new analysis</summary>
      <form onSubmit={submit} aria-busy={submitting}>
        <fieldset disabled={submitting || running}>
          <legend className="visually-hidden">Analysis settings</legend>
          <div className="form-grid">
            <label className="form-field">
              Analysis type
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as "benchmark" | "market")
                }
              >
                <option value="benchmark">Restaurant benchmark</option>
                <option value="market">Market watch</option>
              </select>
            </label>
            <label className="form-field">
              City{kind === "benchmark" ? " (all five restaurants)" : ""}
              <input
                required
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </label>
            {kind === "benchmark" ? (
              <>
                <label className="form-field wide">
                  Your restaurant
                  <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                {competitors.map((value, index) => (
                  <label className="form-field" key={index}>
                    Competitor {index + 1}
                    <input
                      required
                      value={value}
                      onChange={(event) =>
                        setCompetitors((current) =>
                          current.map((item, position) =>
                            position === index ? event.target.value : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </>
            ) : (
              <>
                <label className="form-field wide">
                  Market niche
                  <input
                    required
                    value={niche}
                    onChange={(event) => setNiche(event.target.value)}
                  />
                </label>
                <label className="form-field wide">
                  Topics (optional; one per line)
                  <textarea
                    value={topics}
                    onChange={(event) => setTopics(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          <fieldset className="analysis-platforms">
            <legend>Platforms (select at least one)</legend>
            <div className="analysis-platform-options">
              {allPlatforms.map((platform) => (
                <label key={platform}>
                  <input
                    type="checkbox"
                    checked={platforms.includes(platform)}
                    onChange={(event) =>
                      setPlatforms((current) =>
                        event.target.checked
                          ? allPlatforms.filter(
                              (item) =>
                                item === platform || current.includes(item),
                            )
                          : current.filter((item) => item !== platform),
                      )
                    }
                  />
                  {platformLabel(platform)}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        <p className="small muted">
          Collection filters: language fr (French), country France.
        </p>
        <p className="draft-message" id="analysis-provider-notice">
          Starting an analysis uses the configured Oriane and OpenAI providers
          and may incur charges. Results refresh automatically while it runs.
        </p>
        {error && (
          <p className="state-note" role="alert" tabIndex={-1} ref={errorRef}>
            {error} Your entered values have been kept.
          </p>
        )}
        {accepted && (
          <p role="status">
            Analysis accepted. Follow its progress and results below.
          </p>
        )}
        {running && (
          <p className="small">
            An analysis is running. Wait for it to finish before starting
            another.
          </p>
        )}
        <button
          className="button"
          type="submit"
          disabled={submitting || running}
          aria-describedby="analysis-provider-notice"
        >
          {submitting ? "Starting analysis…" : "Start analysis"}
        </button>
      </form>
    </details>
  );
}
