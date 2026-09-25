import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandSource, IngestionRun } from "@shared/schema";
import { apiFetch } from "@/lib/api";

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.message || `Request failed (${res.status})`);
  return body as T;
}

const SOURCES_KEY = ["/api/admin/brand-sources"];
const RUNS_KEY = ["/api/admin/ingestion-runs"];

export interface RunsResponse {
  runs: IngestionRun[];
  configured: { launches: boolean; prices: boolean; content: boolean };
}

export function useBrandSources() {
  return useQuery({ queryKey: SOURCES_KEY, queryFn: async () => json<BrandSource[]>(await apiFetch(SOURCES_KEY[0])) });
}

export function useIngestionRuns() {
  return useQuery({
    queryKey: RUNS_KEY,
    queryFn: async () => json<RunsResponse>(await apiFetch(RUNS_KEY[0])),
    refetchInterval: 15_000,
  });
}

function useAdminMutation<TVars>(request: (vars: TVars) => Promise<Response>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TVars) => json<any>(await request(vars)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
      queryClient.invalidateQueries({ queryKey: RUNS_KEY });
    },
  });
}

const post = (path: string, body?: unknown) =>
  apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

export function useAddBrandSource() {
  return useAdminMutation((v: { name: string; domain: string; country: "US" | "IN" }) => post("/api/admin/brand-sources", v));
}

export function useAddDefaultBrandSources() {
  return useAdminMutation((_: void) => post("/api/admin/brand-sources/defaults"));
}

export function useToggleBrandSource() {
  return useAdminMutation((v: { id: number; active: boolean }) =>
    apiFetch(`/api/admin/brand-sources/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: v.active }),
    }),
  );
}

export function useRunJob() {
  return useAdminMutation((job: "launches" | "prices" | "content") => post(`/api/admin/jobs/${job}`));
}
