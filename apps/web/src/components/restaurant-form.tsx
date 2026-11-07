"use client";

import { useState, type FormEvent } from "react";
import type { RestaurantDraft, RestaurantProfile } from "@/lib/workspace-types";
import { mutationErrorMessage } from "@/lib/workspace-errors";

interface RestaurantFormProps {
  profile: RestaurantProfile;
  canEdit: boolean;
  onSave: (draft: RestaurantDraft) => Promise<void>;
  onCancel: () => void;
  onSavingChange: (saving: boolean) => void;
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function RestaurantForm({
  profile,
  canEdit,
  onSave,
  onCancel,
  onSavingChange,
}: RestaurantFormProps) {
  const [positioning, setPositioning] = useState(profile.positioning ?? "");
  const [goals, setGoals] = useState(profile.businessGoals.join("\n"));
  const [targets, setTargets] = useState(profile.targetCustomers.join("\n"));
  const [time, setTime] = useState(profile.timeAvailable ?? "");
  const [budget, setBudget] = useState(profile.testBudget ?? "");
  const [constraints, setConstraints] = useState(profile.constraints ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canEdit) return;
    if (lines(goals).length === 0) {
      setError("Enter at least one business goal. Blank lines do not count.");
      return;
    }
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      await onSave({
        positioning: positioning.trim(),
        businessGoals: lines(goals),
        targetCustomers: lines(targets),
        timeAvailable: time.trim(),
        testBudget: budget.trim(),
        constraints: constraints.trim(),
      });
    } catch (cause) {
      setError(mutationErrorMessage(cause));
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={saving}>
      <p className="draft-message">
        Earlier reports keep their original context. Leave optional fields blank
        when unknown.
      </p>
      {!canEdit && (
        <p role="status">You do not have permission to edit this profile.</p>
      )}
      <fieldset disabled={saving || !canEdit}>
        <legend className="visually-hidden">Restaurant context</legend>
        <div className="form-grid">
          <label className="form-field wide">
            Positioning (optional)
            <textarea
              name="positioning"
              value={positioning}
              onChange={(event) => setPositioning(event.target.value)}
            />
          </label>
          <label className="form-field wide">
            Business goals (one per line)
            <textarea
              name="businessGoals"
              required
              value={goals}
              onChange={(event) => setGoals(event.target.value)}
              aria-describedby="goal-help"
            />
          </label>
          <p className="small muted" id="goal-help">
            At least one goal is required.
          </p>
          <label className="form-field wide">
            Target customers (optional; one per line)
            <textarea
              name="targetCustomers"
              value={targets}
              onChange={(event) => setTargets(event.target.value)}
            />
          </label>
          <label className="form-field">
            Time available for content (optional)
            <input
              name="timeAvailable"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
          <label className="form-field">
            Test budget (optional)
            <input
              name="testBudget"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
          <label className="form-field wide">
            Known constraints (optional)
            <textarea
              name="constraints"
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
            />
          </label>
        </div>
      </fieldset>
      {error && (
        <p className="state-note" role="alert">
          {error} Your entered values have been kept.
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button secondary"
          type="button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button className="button" type="submit" disabled={saving || !canEdit}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
