import type { PullRequest } from "./types";
export interface StackNode {
  pr: PullRequest;
  children: StackNode[];
}
export const age = (t?: string | number | null): string => {
  if (!t) return "unknown";
  const n = Math.max(0, (Date.now() - (typeof t === "number" ? t : new Date(t).getTime())) / 60000);
  return n < 1
    ? "just now"
    : n < 60
      ? Math.floor(n) + "m ago"
      : n < 1440
        ? Math.floor(n / 60) + "h ago"
        : Math.floor(n / 1440) + "d ago";
};
export const isStale = (updatedAt: string) =>
  Date.now() - new Date(updatedAt).getTime() > 7 * 86400000;
/** A stack is stale only when none of its pull requests changed recently. */
export const isStaleStack = (node: StackNode): boolean =>
  isStale(node.pr.updatedAt) && node.children.every(isStaleStack);
/** Each reviewer's latest decisive review state, keyed by login. */
function latestReviews(p: PullRequest): Map<string, string> {
  const latest = new Map<string, string>();
  for (const r of [...p.reviews].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
  )) {
    if (r.author?.login && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state))
      latest.set(r.author.login, r.state);
  }
  return latest;
}
export function reviewersWith(p: PullRequest, state: "APPROVED" | "CHANGES_REQUESTED"): string[] {
  return [...latestReviews(p)].filter(([, s]) => s === state).map(([login]) => login);
}
/** Hover text naming who approved or requested changes. */
export function reviewTooltip(p: PullRequest): string | undefined {
  const lines = [
    ["Approved by", reviewersWith(p, "APPROVED")],
    ["Changes requested by", reviewersWith(p, "CHANGES_REQUESTED")],
  ] as const;
  return (
    lines
      .filter(([, logins]) => logins.length)
      .map(([label, logins]) => `${label} ${logins.map((l) => `@${l}`).join(", ")}`)
      .join("\n") || undefined
  );
}
export function approvalState(p: PullRequest) {
  const latest = latestReviews(p);
  if (
    p.reviewDecision === "CHANGES_REQUESTED" ||
    [...latest.values()].includes("CHANGES_REQUESTED")
  )
    return "changes";
  return p.reviewDecision === "APPROVED" || [...latest.values()].includes("APPROVED")
    ? "approved"
    : "pending";
}
export function isAllGreen(p: PullRequest): boolean {
  // Checks paused waiting for approval and failed audits don't block a merge.
  const blocking = ["failed", "pending"];
  return (
    !p.isDraft &&
    p.mergeable !== "CONFLICTING" &&
    p.checks.length > 0 &&
    p.checks.every((c) => !blocking.includes(c.category)) &&
    approvalState(p) === "approved" &&
    !p.reviewLabels.length &&
    !p.discussionError &&
    !p.unresolved.length
  );
}
/** Open for review: published, mergeable, not failing, and still waiting on a reviewer. */
export function isReadyForReview(p: PullRequest): boolean {
  const state = approvalState(p);
  return (
    !p.isDraft &&
    p.mergeable !== "CONFLICTING" &&
    !p.failed &&
    (state === "pending" || (state === "approved" && p.reviewLabels.length > 0))
  );
}
/** Plain text list of pull requests, one per line, for pasting into a chat. */
export const reviewListText = (prs: PullRequest[]): string =>
  prs.map((p) => `- ${p.title}: ${p.url}`).join("\n");
export function stackPRs(prs: PullRequest[]): StackNode[] {
  const nodes: StackNode[] = prs.map((pr) => ({ pr, children: [] }));
  const parent = new Map<StackNode, StackNode>();
  for (const node of nodes) {
    const candidates = nodes.filter(
      (n) =>
        n !== node &&
        n.pr.repo === node.pr.repo &&
        n.pr.headRefName === node.pr.baseRefName &&
        `${n.pr.headRepositoryOwner?.login}/${n.pr.headRepository?.name}`.toLowerCase() ===
          node.pr.repo.toLowerCase(),
    );
    if (candidates.length === 1) parent.set(node, candidates[0]);
  }
  // Ignore cyclic dependencies rather than hiding their rows.
  for (const node of nodes) {
    const seen = new Set([node]);
    let p = parent.get(node);
    while (p) {
      if (seen.has(p)) {
        parent.delete(node);
        break;
      }
      seen.add(p);
      p = parent.get(p);
    }
  }
  for (const [node, p] of parent) p.children.push(node);
  const recent = (n: StackNode): number =>
    Math.max(new Date(n.pr.updatedAt).getTime(), ...n.children.map(recent));
  const order = (list: StackNode[]): StackNode[] =>
    list.sort((a, b) => recent(b) - recent(a)).map((n) => ({ ...n, children: order(n.children) }));
  return order(nodes.filter((n) => !parent.has(n)));
}

export function bodyText(value?: string): string {
  return (value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
