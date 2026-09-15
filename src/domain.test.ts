import { describe, expect, it } from "vite-plus/test";
import { approvalState, bodyText, matchesFilter, stackPRs } from "./domain";
import type { PullRequest } from "./types";

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    repo: "owner/repo",
    number: 1,
    title: "A pull request",
    url: "https://github.com/owner/repo/pull/1",
    headRefName: "feature",
    baseRefName: "main",
    headRepositoryOwner: { login: "owner" },
    headRepository: { name: "repo" },
    updatedAt: "2026-09-01T00:00:00Z",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    reviewLabels: [],
    reviews: [],
    reviewRequests: [],
    checks: [],
    failed: 0,
    pending: 0,
    advisory: 0,
    unresolved: [],
    discussionError: null,
    comments: [],
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    ...overrides,
  };
}
const review = (state: string, day: number, login = "alice") => ({
  state,
  submittedAt: `2026-09-0${day}T00:00:00Z`,
  author: { login },
});

describe("review decisions", () => {
  it("shows individual approval while a team review is pending", () => {
    const p = pr({ reviewLabels: ["Security"], reviews: [review("APPROVED", 1)] });
    expect(approvalState(p)).toBe("approved");
    expect(matchesFilter(p, "attention")).toBe(true);
    expect(matchesFilter(p, "approved")).toBe(true);
  });
  it("uses the latest decisive review and excludes dismissed approvals", () => {
    expect(approvalState(pr({ reviews: [review("DISMISSED", 3), review("APPROVED", 1)] }))).toBe(
      "pending",
    );
    expect(
      approvalState(
        pr({
          reviews: [review("CHANGES_REQUESTED", 1), review("APPROVED", 3), review("COMMENTED", 4)],
        }),
      ),
    ).toBe("approved");
  });
  it("gives changes requested precedence across reviewers", () => {
    expect(
      approvalState(
        pr({ reviews: [review("APPROVED", 3), review("CHANGES_REQUESTED", 2, "bob")] }),
      ),
    ).toBe("changes");
  });
});

describe("PR stacks", () => {
  it("orders stacks by the most recently updated descendant", () => {
    const parent = pr({ headRefName: "parent" });
    const child = pr({ number: 2, baseRefName: "parent", updatedAt: "2026-09-15T00:00:00Z" });
    const other = pr({ number: 3, headRefName: "other", updatedAt: "2026-09-10T00:00:00Z" });
    const result = stackPRs([other, child, parent]);
    expect(result.map((n) => n.pr.number)).toEqual([1, 3]);
    expect(result[0].children[0].pr.number).toBe(2);
    expect(stackPRs([child])[0].pr.number).toBe(2);
  });
  it("does not attach to branches from a fork or another repository", () => {
    const child = pr({ number: 2, baseRefName: "parent" });
    expect(
      stackPRs([pr({ headRefName: "parent", headRepositoryOwner: { login: "fork" } }), child]),
    ).toHaveLength(2);
    expect(stackPRs([pr({ headRefName: "parent", repo: "other/repo" }), child])).toHaveLength(2);
  });
  it("keeps cyclic and ambiguous parents visible", () => {
    const tree = stackPRs([
      pr({ headRefName: "a", baseRefName: "b" }),
      pr({ number: 2, headRefName: "b", baseRefName: "a" }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(
      stackPRs([
        pr({ headRefName: "parent" }),
        pr({ number: 2, headRefName: "parent" }),
        pr({ number: 3, baseRefName: "parent" }),
      ]),
    ).toHaveLength(3);
  });
});

it("keeps HTML comments and markup out of discussion text", () => {
  expect(bodyText("Hello<!-- hidden --> <b>world</b>\n\n\nDone")).toBe("Hello world\n\nDone");
});
