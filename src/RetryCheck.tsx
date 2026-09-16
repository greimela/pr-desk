import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Check } from "./types";

export function RetryCheck({
  repo,
  number,
  check,
}: {
  repo: string;
  number: number;
  check: Check;
}) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/checks/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, number, jobId: check.retryJobId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `Retry failed (${response.status})`);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  if (!check.retryJobId || !["failed", "advisory"].includes(check.category)) return null;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="px-2 py-1 text-xs"
        title="Rerun this GitHub Actions job and its dependent jobs"
        aria-label={`Retry ${check.name || check.context || "check"}`}
        disabled={retry.isPending || retry.isSuccess}
        onClick={() => retry.mutate()}
      >
        {retry.isPending ? "Retrying…" : retry.isSuccess ? "Retry requested" : "↻ Retry"}
      </button>
      {retry.error && (
        <span role="alert" className="max-w-80 text-xs text-[#ad4939]">
          {retry.error.message}
        </span>
      )}
      {retry.isSuccess && (
        <span role="status" className="sr-only">
          Retry requested
        </span>
      )}
    </span>
  );
}
