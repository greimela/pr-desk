import type { ReactNode } from "react";
import { approvalState, reviewTooltip } from "./domain";
import type { PullRequest } from "./types";

const tones = {
  neutral: "bg-[#eef1eb] text-[#657460]",
  red: "bg-[#fbede8] text-[#ad4939]",
  green: "bg-[#e9f3e4] text-[#39713c]",
  amber: "bg-[#f9f0da] text-[#966d25]",
  blue: "bg-[#e7eef8] text-[#4d70a0]",
};
export function Badge({
  children,
  tone = "neutral",
  spinning = false,
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  spinning?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] px-2 py-[5px] text-[0.8rem] ${tones[tone]}`}
    >
      {spinning && (
        <span
          aria-hidden="true"
          className="size-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
      )}
      {children}
    </span>
  );
}
export function SafeLink({ url, children }: { url?: string; children: ReactNode }) {
  return url?.startsWith("https://") ? (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {children} ↗
    </a>
  ) : (
    <>{children}</>
  );
}
export const metaClass = "mt-2 flex flex-wrap items-center gap-[9px] text-xs text-[#7b8578]";
export const smallClass = "mt-[7px] text-xs text-[#7b8578]";
export function ReviewSummary({ pr }: { pr: PullRequest }) {
  const state = approvalState(pr);
  return (
    <span className="inline-flex flex-wrap items-center gap-[5px]">
      {!(pr.isDraft && state === "pending") && (
        <span title={reviewTooltip(pr)}>
          <Badge tone={state === "approved" ? "green" : state === "changes" ? "red" : "amber"}>
            {state === "approved"
              ? "✓ Approved"
              : state === "changes"
                ? "Changes requested"
                : "Pending"}
          </Badge>
        </span>
      )}
      {pr.reviewLabels.map((label, i) => (
        <Badge key={`${label}-${i}`} tone="amber">
          {label}
        </Badge>
      ))}
    </span>
  );
}
// GitHub Octicons (MIT): git-pull-request and git-pull-request-draft.
const openIcon =
  "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z";
const draftIcon =
  "M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z";
const stateIcons = {
  draft: { label: "Draft", color: "text-[#7b8578]", path: draftIcon },
  approved: { label: "Approved", color: "text-[#39713c]", path: openIcon },
  changes: { label: "Changes requested", color: "text-[#ad4939]", path: openIcon },
  pending: { label: "Review pending", color: "text-[#966d25]", path: openIcon },
};
export function PullRequestStateIcon({ pr }: { pr: PullRequest }) {
  const { label: state, color, path } = stateIcons[pr.isDraft ? "draft" : approvalState(pr)];
  const reviewers = reviewTooltip(pr);
  const label = reviewers ? `${state}\n${reviewers}` : state;
  return (
    <svg
      viewBox="0 0 16 16"
      role="img"
      aria-label={label}
      className={`size-4 shrink-0 fill-current ${color}`}
    >
      <title>{label}</title>
      <path d={path} />
    </svg>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#ccd6c5] p-16 text-center text-[#7c8776]">
      {children}
    </div>
  );
}
