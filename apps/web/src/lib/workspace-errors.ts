type ProblemKind =
  "unavailable" | "conflict" | "forbidden" | "expired" | "invalid" | "unknown";

const messages: Record<ProblemKind, string> = {
  unavailable:
    "Your workspace is not connected yet. Profiles and reports will appear when the service is available.",
  conflict:
    "This information changed while you were editing. Close the form and reload the workspace before saving again.",
  forbidden: "You do not have permission to make this change.",
  expired: "Your workspace changed. Reload it before making another change.",
  invalid:
    "The service returned incomplete information. Reload the workspace and try again.",
  unknown:
    "The change could not be saved. Your input is still here. Please try again.",
};

export class WorkspaceProblem extends Error {
  constructor(public readonly kind: ProblemKind, message?: string) {
    super(message ?? messages[kind]);
    this.name = "WorkspaceProblem";
  }
}

export function mutationErrorMessage(error: unknown): string {
  return error instanceof WorkspaceProblem ? error.message : messages.unknown;
}

export function loadingErrorMessage(error: unknown): string {
  return error instanceof WorkspaceProblem
    ? error.message
    : "The workspace could not be loaded. Please try again.";
}
