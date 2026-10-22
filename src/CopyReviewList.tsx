import { useEffect, useState } from "react";
import { reviewListText } from "./domain";
import type { PullRequest } from "./types";

/** Copies the pull requests that are ready for review as a plain text list. */
export function CopyReviewList({ prs }: { prs: PullRequest[] }) {
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (status === "") return;
    const timer = window.setTimeout(() => setStatus(""), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <button
      type="button"
      className="px-2 py-0.5 text-[0.7rem] tracking-[0.8px] uppercase disabled:cursor-default"
      title={
        prs.length
          ? `Copy as a plain text list:\n${prs.map((p) => p.title).join("\n")}`
          : "No pull requests are ready for review"
      }
      disabled={!prs.length}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(reviewListText(prs));
          setStatus("Copied!");
        } catch {
          setStatus("Copy failed");
        }
      }}
    >
      <span role="status">{status || `Copy ${prs.length} ready for review`}</span>
    </button>
  );
}
