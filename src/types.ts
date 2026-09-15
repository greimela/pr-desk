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
export type CheckCategory = "failed" | "pending" | "advisory" | "unknown" | "passed" | "neutral";
export interface Check {
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
}
