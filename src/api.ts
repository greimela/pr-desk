import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardStatus } from "./types";

export async function getStatus(signal?: AbortSignal): Promise<DashboardStatus> {
  const response = await fetch("/api/status", { signal });
  if (!response.ok) throw new Error(`Dashboard connection failed (${response.status})`);
  return response.json();
}
export async function refreshDashboard(): Promise<void> {
  const response = await fetch("/api/refresh", { method: "POST" });
  if (!response.ok) throw new Error(`Refresh request failed (${response.status})`);
}
export function useDashboard() {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => getStatus(signal),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: refreshDashboard,
    onSuccess: () => client.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  return { status, refresh };
}
