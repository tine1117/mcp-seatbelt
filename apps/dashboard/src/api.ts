import type { DashboardConfig, RunPointer, RunSummary, SeatbeltEvent } from "./types";

export async function fetchConfig(): Promise<DashboardConfig> {
  return fetchJson<DashboardConfig>("/api/config");
}

export async function fetchRuns(): Promise<RunPointer[]> {
  return fetchJson<RunPointer[]>("/api/runs");
}

export async function fetchEvents(runId: string): Promise<SeatbeltEvent[]> {
  return fetchJson<SeatbeltEvent[]>(`/api/runs/${encodeURIComponent(runId)}/events`);
}

export async function fetchSummary(runId: string): Promise<RunSummary> {
  return fetchJson<RunSummary>(`/api/runs/${encodeURIComponent(runId)}/summary`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
