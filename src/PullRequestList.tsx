import type { ReactNode } from "react";
import { age, approvalState, isAllGreen, isStale, type StackNode } from "./domain";
import { BranchName } from "./BranchName";
import { MergeButton } from "./MergeButton";
import type { PullRequest } from "./types";
import { Badge, PullRequestStateIcon, SafeLink, ReviewSummary } from "./ui";

const columns = { checks: "w-[200px]", review: "w-[150px]", threads: "w-[110px]" };
/** Section title on a full-width divider, with the column labels aligned to the rows below. */
export function PullRequestListHeader({
  title,
  href,
  action,
  first = false,
}: {
  title: string;
  /** GitHub page listing the same pull requests. */
  href?: string;
  /** Control shown next to the title. */
  action?: ReactNode;
  first?: boolean;
}) {
  // Labels sit on the line with the page background so the line runs between them.
  const label = "bg-[#f4f5f0] pr-3";
  return (
    <div
      className={`${first ? "mt-1" : "mt-6"} relative mb-2.5 flex items-center gap-4 border border-transparent px-5 text-[0.7rem] tracking-[0.8px] text-[#899080] uppercase`}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-[#d6ded1]" aria-hidden="true" />
      <div className="relative -ml-5 flex flex-1 items-center">
        <span className={label}>
          <SafeLink url={href}>{title}</SafeLink>
        </span>
        {action && <span className={label}>{action}</span>}
      </div>
      {(["checks", "review", "threads"] as const).map((column) => (
        <div key={column} className={`relative ${columns[column]} max-[1100px]:hidden`}>
          <span className={`${label} pl-3 -ml-3`}>{column}</span>
        </div>
      ))}
    </div>
  );
}
// Lucide icons (ISC): user and bot.
const humanIcon = (
  <>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>
);
const botIcon = (
  <>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
  </>
);
function ThreadCount({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return (
    <span title={label} aria-label={label} role="img">
      <Badge tone={count ? "amber" : "green"}>
        <svg
          aria-hidden="true"
          className="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
        {count}
      </Badge>
    </span>
  );
}
function PullRequestRow({
  pr: p,
  showRepo,
  reviewing,
  onSelect,
}: {
  pr: PullRequest;
  showRepo: boolean;
  reviewing: boolean;
  onSelect: (pr: PullRequest) => void;
}) {
  const bugs = p.unresolved.filter((t) => t.kind === "bugbot").length;
  const humans = p.unresolved.filter((t) => t.kind === "human").length;
  const bots = p.unresolved.length - humans;
  const stale = isStale(p.updatedAt);
  return (
    <article
      className={`flex cursor-pointer items-center gap-4 rounded-[10px] border px-5 py-2.5 max-[1100px]:flex-wrap ${isAllGreen(p) ? "border-[#bcd8ae] bg-[#f1f8ec] hover:border-[#8fbb7c]" : p.failed ? "border-[#f0cfc6] bg-[#fdf3f0] hover:border-[#e0a596]" : "border-[#dce2d8] bg-white hover:border-[#a9bba0]"}`}
      tabIndex={0}
      role="button"
      aria-label={`Details for ${p.repo} PR ${p.number}: ${p.title}`}
      onClick={() => onSelect(p)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(p);
        }
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 max-[1100px]:basis-full">
        <PullRequestStateIcon pr={p} />
        <span className="min-w-0 truncate text-[0.95rem] font-semibold" title={p.title}>
          <SafeLink url={p.url}>{p.title}</SafeLink>
        </span>
        <div className="flex shrink-0 items-center gap-[9px] text-xs text-[#7b8578]">
          {showRepo && (
            <span title={p.repo}>
              <Badge tone="blue">{p.repo.split("/")[1]}</Badge>
            </span>
          )}
          <span>#{p.number}</span>
          <span
            className={stale ? "text-[#966d25]" : undefined}
            title={`Updated ${new Date(p.updatedAt).toLocaleString()}${stale ? " · stale" : ""}`}
          >
            {age(p.updatedAt)}
          </span>
          {reviewing ? (
            <span>@{p.author?.login || "unknown"}</span>
          ) : (
            <BranchName key={p.headRefName} name={p.headRefName} iconOnly />
          )}
          {p.rereview && <Badge tone="blue">Re-review</Badge>}
          {p.mergeable === "CONFLICTING" && <Badge tone="red">Conflict</Badge>}
          {!reviewing && isAllGreen(p) && <MergeButton pr={p} />}
        </div>
      </div>
      <div className={`flex ${columns.checks} shrink-0 items-center gap-[5px]`}>
        {p.failed > 0 && (
          <span title={`${p.failed} failed`}>
            <Badge tone="red">✕ {p.failed}</Badge>
          </span>
        )}
        {p.pending > 0 && (
          <span title={`${p.pending} pending`}>
            <Badge tone="amber" spinning>
              {p.pending}
            </Badge>
          </span>
        )}
        {!p.failed && !p.pending && (
          <span title={p.checks.length ? "All checks passing" : "No checks"}>
            <Badge tone={p.checks.length ? "green" : "neutral"}>
              {p.checks.length ? "✓" : "–"}
            </Badge>
          </span>
        )}
        {p.advisory > 0 && (
          <span title={`${p.advisory} failed audit check${p.advisory === 1 ? "" : "s"}`}>
            <Badge tone="amber">⚠ {p.advisory}</Badge>
          </span>
        )}
      </div>
      <div className={`${columns.review} shrink-0`}>
        {p.isDraft && approvalState(p) === "pending" && !p.reviewLabels.length ? (
          <Badge>Draft</Badge>
        ) : (
          <ReviewSummary pr={p} />
        )}
      </div>
      <div className={`flex ${columns.threads} shrink-0 items-center gap-1.5`}>
        {p.discussionError ? (
          <span title={p.discussionError}>
            <Badge tone="amber">Threads ?</Badge>
          </span>
        ) : (
          <>
            <ThreadCount
              icon={humanIcon}
              count={humans}
              label={`${humans} unresolved human thread${humans === 1 ? "" : "s"}`}
            />
            <ThreadCount
              icon={botIcon}
              count={bots}
              label={`${bots} unresolved bot thread${bots === 1 ? "" : "s"}${bugs ? ` (${bugs} Bugbot)` : ""}`}
            />
          </>
        )}
      </div>
    </article>
  );
}
export function PullRequestList({
  nodes,
  showRepo,
  reviewing = false,
  onSelect,
}: {
  nodes: StackNode[];
  showRepo: boolean;
  reviewing?: boolean;
  onSelect: (pr: PullRequest) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {nodes.map(({ pr, children }) => (
        <div key={`${pr.repo}#${pr.number}`}>
          <PullRequestRow pr={pr} showRepo={showRepo} reviewing={reviewing} onSelect={onSelect} />
          {children.length > 0 && (
            <div className="mt-2.5 ml-6 border-l-2 border-[#b9cdb0] pl-4 max-[700px]:ml-2 max-[700px]:pl-2">
              <PullRequestList
                nodes={children}
                showRepo={showRepo}
                reviewing={reviewing}
                onSelect={onSelect}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
