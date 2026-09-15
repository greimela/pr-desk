import type { ReactNode } from "react";
import { approvalState } from "./domain";
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
      <Badge tone={state === "approved" ? "green" : state === "changes" ? "red" : "amber"}>
        {state === "approved"
          ? "✓ Approved"
          : state === "changes"
            ? "Changes requested"
            : "Pending"}
      </Badge>
      {pr.reviewLabels.map((label, i) => (
        <Badge key={`${label}-${i}`} tone="amber">
          {label}
        </Badge>
      ))}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#ccd6c5] p-16 text-center text-[#7c8776]">
      {children}
    </div>
  );
}
