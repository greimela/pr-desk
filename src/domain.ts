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
export function approvalState(p: PullRequest) {
  const latest = new Map();
  for (const r of [...p.reviews].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
  )) {
    if (r.author?.login && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state))
      latest.set(r.author.login, r.state);
  }
  if (
    p.reviewDecision === "CHANGES_REQUESTED" ||
    [...latest.values()].includes("CHANGES_REQUESTED")
  )
    return "changes";
  return p.reviewDecision === "APPROVED" || [...latest.values()].includes("APPROVED")
    ? "approved"
    : "pending";
}
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

export const filters = {
  all: "All open",
  attention: "Needs attention",
  failed: "Failing checks",
  comments: "Open discussions",
  approved: "Approved",
} as const;
export type Filter = keyof typeof filters;
export function matchesFilter(p: PullRequest, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return Boolean(
        p.reviewLabels.length ||
        p.failed ||
        p.unresolved.length ||
        p.mergeable === "CONFLICTING" ||
        p.reviewDecision === "CHANGES_REQUESTED",
      );
    case "failed":
      return p.failed > 0;
    case "comments":
      return p.unresolved.length > 0;
    case "approved":
      return approvalState(p) === "approved";
  }
}
export function bodyText(value?: string): string {
  return (value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
