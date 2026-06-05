import { vi } from "vitest";
import type { DashboardConfig, RunPointer, RunSummary, SeatbeltEvent } from "../src/types";

export interface DashboardFixtures {
  config: DashboardConfig;
  runs: RunPointer[];
  eventsByRunId: Record<string, SeatbeltEvent[]>;
  summariesByRunId: Record<string, RunSummary>;
}

interface DashboardApiOptions {
  failures?: Record<string, number>;
  pending?: string[];
}

export class InspectableEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((message: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {}
}

export function createDashboardFixtures(overrides: Partial<DashboardFixtures> = {}): DashboardFixtures {
  const run = createRun();
  const events = [createAllowedEvent(run.runId), createBlockedEvent(run.runId)];
  const summary = createSummary(run.runId, events);

  return {
    config: overrides.config ?? createConfig(),
    runs: overrides.runs ?? [run],
    eventsByRunId: overrides.eventsByRunId ?? { [run.runId]: events },
    summariesByRunId: overrides.summariesByRunId ?? { [run.runId]: summary }
  };
}

export function installDashboardApi(
  fixtures: DashboardFixtures = createDashboardFixtures(),
  options: DashboardApiOptions = {}
) {
  const pendingUrls = new Set(options.pending ?? []);

  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (pendingUrls.has(url)) {
      return new Promise(() => undefined);
    }

    const failureStatus = options.failures?.[url];
    if (failureStatus) {
      return Promise.resolve({
        ok: false,
        status: failureStatus,
        json: async () => ({})
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => routeApiResponse(url, fixtures)
    });
  });

  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    configurable: true
  });

  return fetchMock;
}

export function installInspectableEventSource(): InspectableEventSource[] {
  const eventSources: InspectableEventSource[] = [];
  Object.defineProperty(globalThis, "EventSource", {
    value: class FakeEventSource extends InspectableEventSource {
      constructor(url: string) {
        super(url);
        eventSources.push(this);
      }
    },
    configurable: true
  });
  return eventSources;
}

export function installSilentEventSource(): void {
  Object.defineProperty(globalThis, "EventSource", {
    value: class SilentEventSource {
      onopen: (() => void) | null = null;
      onmessage: ((message: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly url: string) {}
      close(): void {}
    },
    configurable: true
  });
}

export function createRun(runId = "run-1"): RunPointer {
  return {
    runId,
    path: `F:/tmp/${runId}.jsonl`,
    startedAt: "2026-06-05T00:00:00.000Z"
  };
}

export function createConfig(): DashboardConfig {
  return {
    path: "F:/tmp/seatbelt.config.json",
    status: "loaded",
    effective: {
      mode: "strict",
      root: "F:/tmp/project",
      allowlist: {
        paths: []
      }
    },
    sources: {
      mode: "config",
      root: "config",
      allowlist: "default"
    },
    schema: {
      expected: "../docs/seatbelt.config.schema.json",
      status: "missing"
    }
  };
}

export function createAllowedEvent(runId = "run-1"): SeatbeltEvent {
  return {
    schemaVersion: 1,
    runId,
    timestamp: "2026-06-05T00:00:00.000Z",
    direction: "client_to_server",
    method: "tools/list",
    decision: "allowed",
    ruleIds: [],
    messageRedacted: { jsonrpc: "2.0", id: 1, method: "tools/list" }
  };
}

export function createBlockedEvent(runId = "run-1"): SeatbeltEvent {
  return {
    schemaVersion: 1,
    runId,
    timestamp: "2026-06-05T00:00:01.000Z",
    direction: "client_to_server",
    method: "tools/call",
    toolName: "read_file",
    decision: "blocked",
    ruleIds: ["sensitive-path"],
    reason: "sensitive local path matched: .env",
    messageRedacted: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_file" } }
  };
}

export function createSummary(runId = "run-1", events: SeatbeltEvent[] = [createAllowedEvent(runId)]): RunSummary {
  return {
    runId,
    startedAt: "2026-06-05T00:00:00.000Z",
    eventCount: events.length,
    allowedCount: events.filter((event) => event.decision === "allowed").length,
    blockedCount: events.filter((event) => event.decision === "blocked").length,
    redactedCount: events.filter((event) => event.decision === "redacted").length,
    errorCount: events.filter((event) => event.decision === "error").length
  };
}

function routeApiResponse(url: string, fixtures: DashboardFixtures): unknown {
  if (url === "/api/config") {
    return fixtures.config;
  }
  if (url === "/api/runs") {
    return fixtures.runs;
  }

  const eventsMatch = /^\/api\/runs\/([^/]+)\/events$/.exec(url);
  if (eventsMatch) {
    return fixtures.eventsByRunId[decodeURIComponent(eventsMatch[1])] ?? [];
  }

  const summaryMatch = /^\/api\/runs\/([^/]+)\/summary$/.exec(url);
  if (summaryMatch) {
    const runId = decodeURIComponent(summaryMatch[1]);
    return fixtures.summariesByRunId[runId] ?? createSummary(runId, fixtures.eventsByRunId[runId] ?? []);
  }

  throw new Error(`Unhandled dashboard API URL: ${url}`);
}
