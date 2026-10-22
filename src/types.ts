export interface Author {
  login: string;
}
export interface Comment {
  body: string;
  url?: string;
  author: Author | null;
  createdAt?: string;
}
export interface Review {
  author: Author | null;
  state: string;
  submittedAt: string;
  body?: string;
}
export type CheckCategory =
  | "failed"
  | "pending"
  | "waiting"
  | "advisory"
  | "unknown"
  | "passed"
  | "neutral";
export interface Check {
  retryJobId?: string | null;
  category: CheckCategory;
  name?: string;
  context?: string;
  detailsUrl?: string;
  targetUrl?: string;
  conclusion?: string;
  status?: string;
  state?: string;
}
export interface ReviewThread {
  kind: "bugbot" | "bot" | "human";
  path: string;
  line: number | null;
  isOutdated: boolean;
  isResolved: boolean;
  comments: { nodes: Comment[] };
}
export interface PullRequest {
  headRefOid?: string;
  author?: Author | null;
  /** Review requests only: the user reviewed before and was asked again. */
  rereview?: boolean;
  repo: string;
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  headRepositoryOwner: Author | null;
  headRepository: { name: string } | null;
  updatedAt: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string;
  reviewLabels: string[];
  reviews: Review[];
  reviewRequests: { login?: string; name?: string; slug?: string }[];
  checks: Check[];
  failed: number;
  pending: number;
  advisory: number;
  unresolved: ReviewThread[];
  discussionError: string | null;
  comments: Comment[];
  additions: number;
  deletions: number;
  changedFiles: number;
}
export interface Repository {
  name: string;
  prs: PullRequest[];
  reviews?: PullRequest[];
  /** Others' recently updated pull requests that still need a review, not requested from the user. */
  ready?: PullRequest[];
  /** Failing audit checks on the default branch's latest commit. */
  /** Latest deployment to each watched environment. */
  deployments?: {
    environment: string;
    state: "waiting" | "in_progress" | "failed" | "success";
    ref: string;
    url: string | null;
    createdAt: string;
    actor?: string;
    updatedAt: string | null;
  }[];
  /** Latest finished scheduled run of each watched workflow on the default branch. */
  scheduledRuns?: {
    workflow: string;
    name: string;
    failed: boolean;
    branch: string | null;
    url: string | null;
    updatedAt: string | null;
  }[];
  mainAudit?: { branch: string | null; failures: { name: string; url?: string }[]; error?: string };
  error: string | null;
  updatedAt: number | null;
}
export interface DashboardData {
  login: string;
  repositories: Repository[];
  updatedAt: number;
}
export interface DashboardStatus {
  data: DashboardData | null;
  error: string | null;
  refreshing: boolean;
  /** Epoch seconds until which automatic refreshes are paused by a GitHub rate limit. */
  rateLimitedUntil?: number | null;
}
