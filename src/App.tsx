import { useEffect, useState } from "react";
import { useDashboard } from "./api";
import { age, isReadyForReview, isStaleStack, stackPRs, type StackNode } from "./domain";
import type { PullRequest } from "./types";
import { PullRequestList, PullRequestListHeader } from "./PullRequestList";
import { PullRequestDetails } from "./PullRequestDetails";
import { CopyReviewList } from "./CopyReviewList";
import { Empty, SafeLink } from "./ui";

const deploymentStates = {
  waiting: { tone: "bg-[#e7eef8] text-[#36577f]", text: "deployment waiting for approval" },
  in_progress: { tone: "bg-[#e7eef8] text-[#36577f]", text: "deploying" },
  failed: { tone: "bg-[#fbece3] text-[#a44430]", text: "deployment failed" },
  success: { tone: "bg-[#e9f3e4] text-[#39713c]", text: "deployed" },
};

const repositoryFromUrl = () => new URLSearchParams(window.location.search).get("repo") || "all";

export default function App() {
  const { status, refresh } = useDashboard();
  const data = status.data?.data;
  const [repo, setRepo] = useState(repositoryFromUrl);
  useEffect(() => {
    const restoreRepository = () => setRepo(repositoryFromUrl());
    window.addEventListener("popstate", restoreRepository);
    return () => window.removeEventListener("popstate", restoreRepository);
  }, []);
  function selectRepository(name: string) {
    const url = new URL(window.location.href);
    if (name === "all") url.searchParams.delete("repo");
    else url.searchParams.set("repo", name);
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    setRepo(name);
  }
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PullRequest | null>(null);
  const activeRepo = data?.repositories.some((r) => r.name === repo) ? repo : "all";
  const allPRs =
    data?.repositories.flatMap((r) => [...r.prs, ...(r.reviews || []), ...(r.ready || [])]) || [];
  const repositories =
    data?.repositories.filter((r) => activeRepo === "all" || r.name === activeRepo) || [];
  const matches = (p: PullRequest) =>
    `${p.repo} ${p.number} ${p.title} ${p.headRefName} ${p.author?.login || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const list = repositories.flatMap((r) => r.prs).filter(matches);
  // Reviewable first: stacks whose base fails checks sink to the bottom, otherwise most
  // recently updated first (the stable sort keeps stackPRs' recency order).
  const reviewStacks = (prs: PullRequest[]) =>
    stackPRs(prs.filter(matches)).sort((a, b) => Number(a.pr.failed > 0) - Number(b.pr.failed > 0));
  const reviews = reviewStacks(repositories.flatMap((r) => r.reviews || []));
  const ready = reviewStacks(repositories.flatMap((r) => r.ready || []));
  const busy = Boolean(status.data?.refreshing || refresh.isPending);
  const limitedUntil = status.data?.rateLimitedUntil;
  // One rate-limit message replaces the per-repository errors it causes.
  const isRateLimit = (message?: string | null) =>
    Boolean(limitedUntil && /rate limit/i.test(message || ""));
  const errors = [
    status.error ? `${status.error.message}; retrying automatically.` : "",
    refresh.error?.message,
    limitedUntil
      ? `GitHub rate limit reached. Automatic refreshes are paused until ${new Date(limitedUntil * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${data ? "; showing the last data" : ""}.`
      : "",
    status.data?.error && !isRateLimit(status.data.error)
      ? `Refresh failed. ${data ? "Showing the last successful snapshot. " : ""}${status.data.error}`
      : "",
    ...repositories
      .filter((r) => r.error && !isRateLimit(r.error))
      .map(
        (r) =>
          `${r.name}: ${r.error}${r.updatedAt ? ` · Showing data from ${age(r.updatedAt * 1000)}` : ""}`,
      ),
  ].filter(Boolean);
  // GitHub searches matching the sections, scoped like the selected tab.
  const scope =
    activeRepo === "all"
      ? (data?.repositories || []).map((r) => `repo:${r.name}`).join(" ")
      : `repo:${activeRepo}`;
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const githubSearch = (query: string) =>
    `https://github.com/pulls?q=${encodeURIComponent(`is:pr is:open ${query}`)}`;
  const mineUrl = githubSearch(
    `author:${data?.login}${activeRepo === "all" ? "" : ` repo:${activeRepo}`}`,
  );
  const readyUrl = githubSearch(
    `draft:false -author:${data?.login} -review-requested:${data?.login} -review:approved updated:>=${since} ${scope}`,
  );
  const auditFailures = repositories.filter((r) => r.mainAudit?.failures.length);
  // Successful deployments stay visible for an hour; failures until the next deployment.
  const deployments = repositories.flatMap((r) =>
    (r.deployments || [])
      .filter(
        (d) =>
          d.state !== "success" ||
          Date.now() - new Date(d.updatedAt || d.createdAt).getTime() < 3600000,
      )
      .map((d) => ({ ...d, repo: r.name })),
  );
  const failedSchedules = repositories.flatMap((r) =>
    (r.scheduledRuns || []).filter((s) => s.failed).map((s) => ({ ...s, repo: r.name })),
  );
  const stacks = stackPRs(list);
  const fresh = stacks.filter((n) => !isStaleStack(n));
  const stale = stacks.filter(isStaleStack);
  // Copied in the order shown, parents before the pull requests stacked on them.
  const flatten = (nodes: StackNode[]): PullRequest[] =>
    nodes.flatMap((n) => [n.pr, ...flatten(n.children)]);
  const readyForReview = flatten([...fresh, ...stale]).filter(isReadyForReview);
  const detail =
    selected &&
    (allPRs.find((p) => p.repo === selected.repo && p.number === selected.number) || selected);
  return (
    <>
      <header className="flex h-[78px] items-center justify-between gap-5 border-b border-[#dce2d8] bg-[#fbfcf8] px-9 max-[700px]:h-auto max-[700px]:items-start max-[700px]:p-[18px]">
        <div className="flex items-center gap-3.5 text-sm">
          <span className="grid size-[34px] place-items-center rounded-[9px] bg-[#284f3e] text-[26px] text-[#dffa9c]">
            ⑂
          </span>
          <strong className="text-[1.05rem]">PR desk</strong>
        </div>
        <div className="flex items-center gap-3.5 text-[0.8rem] text-[#69776b] max-[700px]:flex-col max-[700px]:items-end max-[700px]:gap-1.5">
          <span className="rounded-[20px] bg-[#e5eadf] px-[13px] py-2 text-sm max-[700px]:hidden">
            {data ? `@${data.login}` : "GitHub"}
          </span>
          <button disabled={busy} onClick={() => refresh.mutate()}>
            ↻ Refresh
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1510px] px-9 pb-9 max-[700px]:px-4 max-[700px]:pb-6">
        {errors.length > 0 && (
          <div
            role="alert"
            className="mb-5 rounded-lg bg-[#fbece3] p-[15px] whitespace-pre-line text-[#a44430]"
          >
            {errors.join("\n")}
          </div>
        )}
        <div className="mb-5 flex items-center justify-between gap-5 border-b border-[#d6ded1] max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-3">
          <nav aria-label="Repositories" className="flex min-w-0 flex-1 gap-6 overflow-x-auto">
            {[
              { name: "all", label: "All", count: allPRs.length },
              ...(data?.repositories.map((r) => ({
                name: r.name,
                label: r.name,
                count: r.prs.length + (r.reviews?.length || 0) + (r.ready?.length || 0),
              })) || []),
            ].map((r) => (
              <button
                key={r.name}
                aria-pressed={r.name === activeRepo}
                onClick={() => selectRepository(r.name)}
                className={`shrink-0 rounded-none border-0 border-b-[3px] bg-transparent px-0 py-3.5 text-base whitespace-nowrap ${r.name === activeRepo ? "border-[#365b40] font-semibold text-[#284b36]" : "border-transparent text-[#72806f]"}`}
              >
                {r.label}{" "}
                <span className="ml-1 rounded-[5px] bg-[#e4e9df] px-[7px] py-[3px] text-xs">
                  {r.count}
                </span>
              </button>
            ))}
          </nav>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search branches and pull requests"
            placeholder="Search title, branch, or #…"
            className="w-[260px] shrink-0 rounded-[7px] border border-[#d7dfd1] bg-[#fcfdf9] px-[13px] py-2.5 text-sm max-[700px]:mb-3 max-[700px]:w-full"
          />
        </div>
        {deployments.map((d) => {
          const { tone, text } = deploymentStates[d.state];
          return (
            <div
              key={`${d.repo}:${d.environment}`}
              role={d.state === "failed" ? "alert" : "status"}
              className={`-mt-1 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-[15px] py-2.5 text-sm ${tone}`}
            >
              <strong className="inline-flex items-center gap-2">
                {d.state === "in_progress" && (
                  <span
                    aria-hidden="true"
                    className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                  />
                )}
                {d.environment} {text}
                {activeRepo === "all" ? ` · ${d.repo}` : ""}
              </strong>
              <SafeLink url={d.url || undefined}>{d.ref}</SafeLink>
              <span title={new Date(d.updatedAt || d.createdAt).toLocaleString()}>
                {d.state === "success" ? "finished" : "started"}{" "}
                {age(d.state === "success" ? d.updatedAt : d.createdAt)}
                {d.actor ? ` by @${d.actor}` : ""}
              </span>
            </div>
          );
        })}
        {failedSchedules.map((s) => (
          <div
            key={`${s.repo}:${s.workflow}`}
            role="alert"
            className="-mt-1 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[#fbece3] px-[15px] py-2.5 text-sm text-[#a44430]"
          >
            <strong>
              Scheduled {s.name} failed on {s.branch || "the default branch"}
              {activeRepo === "all" ? ` · ${s.repo}` : ""}
            </strong>
            <SafeLink url={s.url || undefined}>View run</SafeLink>
            {s.updatedAt && (
              <span title={new Date(s.updatedAt).toLocaleString()}>
                finished {age(s.updatedAt)}
              </span>
            )}
          </div>
        ))}
        {auditFailures.length > 0 && (
          <div
            role="alert"
            className="-mt-1 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[#f9f0da] px-[15px] py-2.5 text-sm text-[#7a5518]"
          >
            <strong>⚠ Audit failing on the default branch</strong>
            {auditFailures.map((r) => (
              <span key={r.name} title={r.mainAudit!.failures.map((f) => f.name).join("\n")}>
                <SafeLink url={r.mainAudit!.failures[0].url}>
                  {r.name} · {r.mainAudit!.branch}
                </SafeLink>
              </span>
            ))}
          </div>
        )}
        {!data ? (
          <Empty>
            {errors.length
              ? "GitHub data is unavailable. Check your connection and GitHub CLI login, then refresh."
              : "Loading pull requests…"}
          </Empty>
        ) : list.length || reviews.length || ready.length ? (
          <>
            {reviews.length > 0 && (
              <>
                <PullRequestListHeader title="To review" first />
                <PullRequestList
                  nodes={reviews}
                  showRepo={activeRepo === "all"}
                  reviewing
                  onSelect={setSelected}
                />
              </>
            )}
            {ready.length > 0 && (
              <>
                <PullRequestListHeader
                  title="Ready for review · updated in the last 7 days"
                  href={readyUrl}
                  first={!reviews.length}
                />
                <PullRequestList
                  nodes={ready}
                  showRepo={activeRepo === "all"}
                  reviewing
                  onSelect={setSelected}
                />
              </>
            )}
            {list.length > 0 && (
              <PullRequestListHeader
                title="My pull requests"
                href={mineUrl}
                action={<CopyReviewList prs={readyForReview} />}
                first={!reviews.length && !ready.length}
              />
            )}
            <PullRequestList nodes={fresh} showRepo={activeRepo === "all"} onSelect={setSelected} />
            {stale.length > 0 && (
              <>
                <PullRequestListHeader title="Stale · no updates for 7+ days" />
                <PullRequestList
                  nodes={stale}
                  showRepo={activeRepo === "all"}
                  onSelect={setSelected}
                />
              </>
            )}
          </>
        ) : (
          <Empty>No pull requests match this view.</Empty>
        )}
      </main>
      {detail && <PullRequestDetails pr={detail} onClose={() => setSelected(null)} />}
    </>
  );
}
