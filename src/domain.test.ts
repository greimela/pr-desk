import { describe, expect, it } from "vite-plus/test";
import {
  approvalState,
  bodyText,
  reviewTooltip,
  isAllGreen,
  isReadyForReview,
  reviewListText,
  isStaleStack,
  stackPRs,
} from "./domain";
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

describe("all green", () => {
  const green = {
    checks: [{ category: "passed" as const }],
    reviewDecision: "APPROVED",
  };
  it("requires passing checks, approval and no open threads", () => {
    expect(isAllGreen(pr(green))).toBe(true);
    expect(isAllGreen(pr({ ...green, checks: [] }))).toBe(false);
    expect(isAllGreen(pr({ ...green, checks: [{ category: "advisory" }] }))).toBe(true);
    expect(isAllGreen(pr({ ...green, reviewDecision: "" }))).toBe(false);
    expect(isAllGreen(pr({ ...green, reviewLabels: ["Security"] }))).toBe(false);
    expect(isAllGreen(pr({ ...green, isDraft: true }))).toBe(false);
    expect(isAllGreen(pr({ ...green, mergeable: "CONFLICTING" }))).toBe(false);
    expect(isAllGreen(pr({ ...green, discussionError: "offline" }))).toBe(false);
  });
  it("treats checks waiting for approval as passing", () => {
    expect(
      isAllGreen(pr({ ...green, checks: [{ category: "passed" }, { category: "waiting" }] })),
    ).toBe(true);
    expect(
      isAllGreen(pr({ ...green, checks: [{ category: "waiting" }, { category: "pending" }] })),
    ).toBe(false);
  });
});

describe("ready for review", () => {
  it("requires a published, mergeable pull request without failing checks", () => {
    expect(isReadyForReview(pr())).toBe(true);
    expect(isReadyForReview(pr({ pending: 1 }))).toBe(true);
    expect(isReadyForReview(pr({ isDraft: true }))).toBe(false);
    expect(isReadyForReview(pr({ mergeable: "CONFLICTING" }))).toBe(false);
    expect(isReadyForReview(pr({ failed: 1 }))).toBe(false);
  });
  it("excludes reviewed pull requests unless a team review is still pending", () => {
    expect(isReadyForReview(pr({ reviewDecision: "APPROVED" }))).toBe(false);
    expect(isReadyForReview(pr({ reviewDecision: "CHANGES_REQUESTED" }))).toBe(false);
    expect(isReadyForReview(pr({ reviewDecision: "APPROVED", reviewLabels: ["Security"] }))).toBe(
      true,
    );
  });
  it("lists one pull request per line", () => {
    expect(
      reviewListText([pr(), pr({ number: 2, title: "Another", url: "https://example.com/2" })]),
    ).toBe(
      "- A pull request: https://github.com/owner/repo/pull/1\n- Another: https://example.com/2",
    );
  });
});

describe("stale stacks", () => {
  it("keeps a stack fresh while any pull request in it changed recently", () => {
    const old = pr({ updatedAt: "2020-01-01T00:00:00Z" });
    const recent = pr({ number: 2, updatedAt: new Date().toISOString() });
    expect(isStaleStack({ pr: old, children: [] })).toBe(true);
    expect(isStaleStack({ pr: old, children: [{ pr: recent, children: [] }] })).toBe(false);
  });
});

describe("review tooltip", () => {
  it("names current approvers and change requesters", () => {
    const p = pr({
      reviews: [
        review("APPROVED", 1, "alice"),
        review("CHANGES_REQUESTED", 2, "bob"),
        review("CHANGES_REQUESTED", 1, "carol"),
        review("APPROVED", 3, "carol"),
        review("APPROVED", 1, "dave"),
        review("DISMISSED", 2, "dave"),
      ],
    });
    expect(reviewTooltip(p)).toBe("Approved by @alice, @carol\nChanges requested by @bob");
    expect(reviewTooltip(pr())).toBeUndefined();
  });
});
