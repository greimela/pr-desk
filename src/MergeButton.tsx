import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PullRequest } from "./types";

export function MergeButton({ pr }: { pr: PullRequest }) {
  const client = useQueryClient();
  const merge = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/pulls/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: pr.repo, number: pr.number }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `Merge failed (${response.status})`);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="border-[#9cc58a] bg-[#e3f1db] px-2 py-0.5 text-xs font-semibold text-[#2f6431] hover:bg-[#d4e9c9]"
        title={`Merge into ${pr.baseRefName}`}
        disabled={merge.isPending || merge.isSuccess}
        onClick={(e) => {
          e.stopPropagation();
          if (
            window.confirm(`Merge ${pr.repo}#${pr.number} into ${pr.baseRefName}?\n\n${pr.title}`)
          )
            merge.mutate();
        }}
      >
        {merge.isPending ? "Merging…" : merge.isSuccess ? "Merged" : "Merge"}
      </button>
      {merge.error && (
        <span
          role="alert"
          className="max-w-60 truncate text-xs text-[#ad4939]"
          title={merge.error.message}
        >
          {merge.error.message}
        </span>
      )}
    </span>
  );
}
