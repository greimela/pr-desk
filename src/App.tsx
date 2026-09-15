import { useEffect, useState } from "react";
import { useDashboard } from "./api";
import { age, filters, matchesFilter, stackPRs, type Filter } from "./domain";
import type { PullRequest } from "./types";
import { PullRequestList } from "./PullRequestList";
import { PullRequestDetails } from "./PullRequestDetails";
import { Empty } from "./ui";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PullRequest | null>(null);
  const activeRepo = data?.repositories.some((r) => r.name === repo) ? repo : "all";
  const allPRs = data?.repositories.flatMap((r) => r.prs) || [];
  const repositories =
    data?.repositories.filter((r) => activeRepo === "all" || r.name === activeRepo) || [];
  const list = repositories
    .flatMap((r) => r.prs)
    .filter(
      (p) =>
        `${p.repo} ${p.number} ${p.title} ${p.headRefName}`
          .toLowerCase()
          .includes(search.toLowerCase()) && matchesFilter(p, filter),
    );
  const busy = Boolean(status.data?.refreshing || refresh.isPending);
  const errors = [
    status.error ? `${status.error.message}; retrying automatically.` : "",
    refresh.error?.message,
    status.data?.error
      ? `Refresh failed. ${data ? "Showing the last successful snapshot. " : ""}${status.data.error}`
      : "",
    ...repositories
      .filter((r) => r.error)
      .map(
        (r) =>
          `${r.name}: ${r.error}${r.updatedAt ? ` · Showing data from ${age(r.updatedAt * 1000)}` : ""}`,
      ),
  ].filter(Boolean);
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
          <span role="status">
            {busy
              ? "Refreshing…"
              : data
                ? `Updated ${age(data.updatedAt * 1000)}`
                : status.isPending
                  ? "Connecting to GitHub…"
                  : "Waiting for data"}
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
        <div className="flex items-center justify-between gap-5 border-b border-[#d6ded1] max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-3">
          <nav aria-label="Repositories" className="flex min-w-0 flex-1 gap-6 overflow-x-auto">
            {[
              { name: "all", label: "All", count: allPRs.length },
              ...(data?.repositories.map((r) => ({
                name: r.name,
                label: r.name,
                count: r.prs.length,
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
        <div className="my-5 flex gap-2 overflow-x-auto whitespace-nowrap">
          {(Object.entries(filters) as [Filter, string][]).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={
                filter === value
                  ? "border-[#d6e0cd] bg-[#e0e9d8] text-[#254b34]"
                  : "border-transparent bg-transparent text-[#677566]"
              }
            >
              {label}
            </button>
          ))}
        </div>
        {!data ? (
          <Empty>
            {errors.length
              ? "GitHub data is unavailable. Check your connection and GitHub CLI login, then refresh."
              : "Loading pull requests…"}
          </Empty>
        ) : list.length ? (
          <PullRequestList
            nodes={stackPRs(list)}
            showRepo={activeRepo === "all"}
            onSelect={setSelected}
          />
        ) : (
          <Empty>No pull requests match this view.</Empty>
        )}
      </main>
      {detail && <PullRequestDetails pr={detail} onClose={() => setSelected(null)} />}
    </>
  );
}
