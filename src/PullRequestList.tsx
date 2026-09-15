import { age, type StackNode } from "./domain";
import type { PullRequest } from "./types";
import { Badge, SafeLink, ReviewSummary, metaClass, smallClass } from "./ui";

function Label({ children }: { children: string }) {
  return (
    <div className="mb-2 text-[0.7rem] tracking-[0.8px] text-[#899080] uppercase">{children}</div>
  );
}
function PullRequestRow({
  pr: p,
  showRepo,
  onSelect,
}: {
  pr: PullRequest;
  showRepo: boolean;
  onSelect: (pr: PullRequest) => void;
}) {
  const bugs = p.unresolved.filter((t) => t.kind === "bugbot").length;
  const humans = p.unresolved.filter((t) => t.kind === "human").length;
  const other = p.unresolved.length - bugs - humans;
  return (
    <article
      className="grid cursor-pointer grid-cols-1 items-center gap-5 rounded-[10px] border border-[#dce2d8] bg-white px-[23px] py-[21px] hover:border-[#a9bba0] min-[701px]:grid-cols-[minmax(0,1fr)_310px] min-[1251px]:grid-cols-[minmax(0,1fr)_260px_310px_140px] max-[700px]:p-[18px]"
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
      <div className="min-w-0">
        <div className="text-base leading-normal font-semibold">
          <SafeLink url={p.url}>{p.title}</SafeLink>
        </div>
        <div className={metaClass}>
          {showRepo && <Badge tone="blue">{p.repo}</Badge>}
          <span>#{p.number}</span>
          <span title={new Date(p.updatedAt).toLocaleString()}>Updated {age(p.updatedAt)}</span>
          <span className="max-w-[310px] truncate font-mono" title={p.headRefName}>
            {p.headRefName}
          </span>
          {p.isDraft && <Badge>Draft</Badge>}
          {p.mergeable === "CONFLICTING" && <Badge tone="red">Merge conflict</Badge>}
          {Date.now() - new Date(p.updatedAt).getTime() > 7 * 86400000 && (
            <Badge tone="amber">Stale · 7d+</Badge>
          )}
        </div>
      </div>
      <div>
        <Label>Checks</Label>
        <div className="flex flex-wrap items-center gap-[5px]">
          {p.failed > 0 && <Badge tone="red">{p.failed} failed</Badge>}
          {p.pending > 0 && (
            <Badge tone="amber" spinning>
              {p.pending} pending
            </Badge>
          )}
          {!p.failed && !p.pending && (
            <Badge tone={p.checks.length ? "green" : "neutral"}>
              {p.checks.length ? "✓ Passing" : "No checks"}
            </Badge>
          )}
          {p.advisory > 0 && <Badge tone="amber">{p.advisory} audit</Badge>}
        </div>
      </div>
      <div>
        <Label>Review</Label>
        <ReviewSummary pr={p} />
      </div>
      <div>
        <Label>Open threads</Label>
        {p.discussionError ? (
          <Badge tone="amber">Unavailable</Badge>
        ) : p.unresolved.length ? (
          <Badge tone="amber">{p.unresolved.length} unresolved</Badge>
        ) : (
          <Badge tone="green">All clear</Badge>
        )}
        {p.unresolved.length > 0 && (
          <div className={smallClass}>
            {[
              bugs ? `${bugs} Bugbot` : "",
              humans ? `${humans} human` : "",
              other ? `${other} bot` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
      </div>
    </article>
  );
}
export function PullRequestList({
  nodes,
  showRepo,
  onSelect,
}: {
  nodes: StackNode[];
  showRepo: boolean;
  onSelect: (pr: PullRequest) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {nodes.map(({ pr, children }) => (
        <div key={`${pr.repo}#${pr.number}`}>
          <PullRequestRow pr={pr} showRepo={showRepo} onSelect={onSelect} />
          {children.length > 0 && (
            <div className="mt-2.5 ml-6 border-l-2 border-[#b9cdb0] pl-4 max-[700px]:ml-2 max-[700px]:pl-2">
              <PullRequestList nodes={children} showRepo={showRepo} onSelect={onSelect} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
