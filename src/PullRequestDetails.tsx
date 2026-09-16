import { useEffect, useRef, type ReactNode } from "react";
import { age } from "./domain";
import { CommentMarkdown } from "./CommentMarkdown";
import { RetryCheck } from "./RetryCheck";
import { BranchName } from "./BranchName";
import type { CheckCategory, PullRequest } from "./types";
import { Badge, SafeLink, ReviewSummary, metaClass, smallClass } from "./ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-[23px] border-t border-[#dce2d4] pt-2">
      <h3 className="my-4 text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}
function CommentBox({ children }: { children: ReactNode }) {
  return <div className="my-2.5 rounded-lg border border-[#dce2d4] bg-white p-3.5">{children}</div>;
}
const checkOrder: CheckCategory[] = [
  "failed",
  "pending",
  "advisory",
  "unknown",
  "passed",
  "neutral",
];
export function PullRequestDetails({ pr: p, onClose }: { pr: PullRequest; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const requested = p.reviewRequests.map((r) => r.login || r.name || r.slug).filter(Boolean);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="detail-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[88vh] w-[calc(100%-32px)] max-w-[800px] overflow-y-auto rounded-[15px] border border-[#d4ddcc] bg-[#fbfcf8] p-7 text-inherit backdrop:bg-[#1b302b66] backdrop:backdrop-blur-[3px]"
    >
      <div className="flex items-start justify-between gap-[15px]">
        <h2 id="detail-title" className="text-[1.4rem] leading-normal font-bold">
          <SafeLink url={p.url}>
            #{p.number} {p.title}
          </SafeLink>
        </h2>
        <button aria-label="Close details" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className={`${metaClass} mb-3`}>
        <Badge tone="blue">{p.repo}</Badge>
        <BranchName key={p.headRefName} name={p.headRefName} />→ {p.baseRefName} · +{p.additions} −
        {p.deletions} · {p.changedFiles} files
      </p>
      <div className={metaClass}>
        <ReviewSummary pr={p} />
        <Badge>{p.isDraft ? "Draft" : p.mergeStateStatus || "Merge state unknown"}</Badge>
        <span>Updated {age(p.updatedAt)}</span>
      </div>
      <p className={smallClass}>Requested reviewers: {requested.join(", ") || "None listed"}</p>
      <Section title={`Unresolved review threads · ${p.unresolved.length}`}>
        {p.discussionError && <p>{p.discussionError}</p>}
        {p.unresolved.map((thread, index) => {
          const c = thread.comments.nodes[0];
          return (
            <CommentBox key={c?.url || index}>
              <div className={metaClass}>
                <Badge tone={thread.kind === "bugbot" ? "amber" : "blue"}>{thread.kind}</Badge>
                <SafeLink url={c?.url}>{c?.author?.login || "Deleted user"}</SafeLink>
                <span>
                  {thread.path}
                  {thread.line ? `:${thread.line}` : ""}
                </span>
                {thread.isOutdated && <Badge>Outdated code</Badge>}
              </div>
              <CommentMarkdown body={c?.body} />
            </CommentBox>
          );
        })}
        {!p.unresolved.length && <p className={smallClass}>No unresolved review threads.</p>}
      </Section>
      <Section title={`Checks · ${p.checks.length}`}>
        {[...p.checks]
          .sort((a, b) => checkOrder.indexOf(a.category) - checkOrder.indexOf(b.category))
          .map((c, index) => (
            <div
              key={`${c.name || c.context}-${index}`}
              className="flex justify-between gap-[15px] py-2 text-sm"
            >
              <SafeLink url={c.detailsUrl || c.targetUrl}>{c.name || c.context}</SafeLink>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <RetryCheck
                  key={c.retryJobId || c.status}
                  repo={p.repo}
                  number={p.number}
                  check={c}
                />
                <Badge
                  tone={
                    c.category === "failed"
                      ? "red"
                      : ["pending", "advisory"].includes(c.category)
                        ? "amber"
                        : c.category === "passed"
                          ? "green"
                          : "neutral"
                  }
                  spinning={c.category === "pending"}
                >
                  {c.category === "advisory"
                    ? "Audit advisory"
                    : c.conclusion || c.status || c.state}
                </Badge>
              </div>
            </div>
          ))}
      </Section>
      <Section title="Reviews">
        {p.reviews.map((r, index) => (
          <CommentBox key={`${r.author?.login}-${r.submittedAt}-${index}`}>
            <div className={metaClass}>
              {r.author?.login || "Deleted user"}
              <Badge>{r.state}</Badge>
              <span>{age(r.submittedAt)}</span>
            </div>
            {r.body && <CommentMarkdown body={r.body} />}
          </CommentBox>
        ))}
        {!p.reviews.length && <p className={smallClass}>No submitted reviews.</p>}
      </Section>
      <Section title={`General comments · ${p.comments.length}`}>
        <p className={smallClass}>
          These comments have no resolved state on GitHub. They are separate from open review
          threads.
        </p>
        {p.comments.map((c, index) => (
          <CommentBox key={c.url || index}>
            <div className={metaClass}>
              <SafeLink url={c.url}>{c.author?.login || "Deleted user"}</SafeLink>
              <span>{age(c.createdAt)}</span>
            </div>
            <CommentMarkdown body={c.body} />
          </CommentBox>
        ))}
      </Section>
    </dialog>
  );
}
