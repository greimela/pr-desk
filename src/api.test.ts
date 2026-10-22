import { afterEach, expect, it, vi } from "vite-plus/test";
import { getStatus, refreshDashboard } from "./api";

afterEach(() => vi.unstubAllGlobals());
it("passes cancellation to the status request", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: null, error: null, refreshing: true })));
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect(await getStatus(signal)).toEqual({ data: null, error: null, refreshing: true });
  expect(fetcher).toHaveBeenCalledWith("/api/status", { signal });
});
it("reports rejected refresh requests", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(refreshDashboard()).rejects.toThrow("Refresh request failed (403)");
  expect(fetcher).toHaveBeenCalledWith("/api/refresh", { method: "POST" });
});
