import { get, type ClientRequest, type IncomingMessage } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlEventStore } from "../src/logging/event-store.js";
import { startDashboardServer } from "../src/dashboard-server/server.js";

describe("dashboard server", () => {
  it("serves runs, events, and summaries from the JSONL store", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-dashboard-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "dashboard-run" });
    await store.append({
      schemaVersion: 1,
      runId: "dashboard-run",
      timestamp: "2026-06-05T00:00:00.000Z",
      direction: "client_to_server",
      method: "tools/call",
      toolName: "read_file",
      decision: "blocked",
      ruleIds: ["sensitive-path"],
      messageRedacted: { jsonrpc: "2.0", id: 1, method: "tools/call" }
    });
    await store.close();

    const server = await startDashboardServer({ store, port: 0 });
    try {
      const runs = await getJson(`${server.url}/api/runs`);
      const events = await getJson(`${server.url}/api/runs/dashboard-run/events`);
      const summary = await getJson(`${server.url}/api/runs/dashboard-run/summary`);

      expect(runs).toEqual(expect.arrayContaining([expect.objectContaining({ runId: "dashboard-run" })]));
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ decision: "blocked" })]));
      expect(summary).toMatchObject({ runId: "dashboard-run", blockedCount: 1, eventCount: 1 });
    } finally {
      await server.close();
    }
  });

  it("serves the effective seatbelt config for the dashboard", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-dashboard-config-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "dashboard-config-run" });
    const server = await startDashboardServer({
      store,
      port: 0,
      config: {
        path: join(root, "seatbelt.config.json"),
        status: "loaded",
        effective: {
          mode: "strict",
          root,
          allowlist: {
            paths: [join(root, "shared-readonly")]
          }
        },
        sources: {
          mode: "config",
          root: "config",
          allowlist: "config"
        },
        schema: {
          expected: "../docs/seatbelt.config.schema.json",
          declared: "../docs/seatbelt.config.schema.json",
          status: "matched"
        }
      }
    });

    try {
      const config = await getJson(`${server.url}/api/config`);

      expect(config).toMatchObject({
        status: "loaded",
        effective: {
          mode: "strict",
          root,
          allowlist: {
            paths: [join(root, "shared-readonly")]
          }
        },
        sources: {
          mode: "config",
          root: "config",
          allowlist: "config"
        },
        schema: {
          expected: "../docs/seatbelt.config.schema.json",
          declared: "../docs/seatbelt.config.schema.json",
          status: "matched"
        }
      });
    } finally {
      await server.close();
      await store.close();
    }
  });

  it("serves missing and mismatched schema metadata for the dashboard", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-dashboard-schema-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "dashboard-schema-run" });
    const baseConfig = {
      path: join(root, "seatbelt.config.json"),
      status: "loaded" as const,
      effective: {
        mode: "protect" as const,
        root,
        allowlist: {
          paths: []
        }
      },
      sources: {
        mode: "default" as const,
        root: "default" as const,
        allowlist: "default" as const
      }
    };
    const missingServer = await startDashboardServer({
      store,
      port: 0,
      config: {
        ...baseConfig,
        schema: {
          expected: "../docs/seatbelt.config.schema.json",
          status: "missing"
        }
      }
    });
    const mismatchedServer = await startDashboardServer({
      store,
      port: 0,
      config: {
        ...baseConfig,
        schema: {
          expected: "../docs/seatbelt.config.schema.json",
          declared: "https://example.com/other-schema.json",
          status: "mismatched"
        }
      }
    });

    try {
      const missing = await getJson(`${missingServer.url}/api/config`);
      const mismatched = await getJson(`${mismatchedServer.url}/api/config`);

      expect(missing).toMatchObject({ schema: { status: "missing" } });
      expect(mismatched).toMatchObject({
        schema: {
          status: "mismatched",
          declared: "https://example.com/other-schema.json"
        }
      });
    } finally {
      await missingServer.close();
      await mismatchedServer.close();
      await store.close();
    }
  });

  it("cleans up SSE listeners when a stream client disconnects", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-dashboard-sse-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "dashboard-sse-run" });
    const server = await startDashboardServer({ store, port: 0 });
    let stream: { request: ClientRequest; response: IncomingMessage } | undefined;

    try {
      stream = await openSse(`${server.url}/api/events/stream?runId=dashboard-sse-run`);

      expect(stream.response.statusCode).toBe(200);
      await waitFor(() => store.listenerCount("event") === 1);

      stream.request.destroy();

      await waitFor(() => store.listenerCount("event") === 0);
    } finally {
      stream?.request.destroy();
      await server.close();
      await store.close();
    }
  });

  it("does not serve files outside staticDir and falls back to the dashboard shell", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-dashboard-static-"));
    const staticDir = join(root, "public");
    const store = await JsonlEventStore.create({ rootDir: root, runId: "dashboard-static-run" });
    await mkdir(staticDir, { recursive: true });
    await writeFile(join(root, "secret.txt"), "outside secret", "utf8");
    await writeFile(join(staticDir, "index.html"), "<!doctype html><main>dashboard shell</main>", "utf8");

    const server = await startDashboardServer({ store, port: 0, staticDir });
    try {
      const response = await fetch(`${server.url}/..%2fsecret.txt`);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toContain("dashboard shell");
      expect(text).not.toContain("outside secret");
    } finally {
      await server.close();
      await store.close();
    }
  });

  it("serves fallback HTML without a built dashboard and returns JSON API errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-dashboard-fallback-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "dashboard-fallback-run" });
    const fallbackServer = await startDashboardServer({ store, port: 0 });
    const failingStore = {
      listRuns: async () => {
        throw new Error("run index unavailable");
      }
    } as unknown as JsonlEventStore;
    const failingServer = await startDashboardServer({ store: failingStore, port: 0 });

    try {
      const fallback = await fetch(`${fallbackServer.url}/missing-route`);
      const fallbackText = await fallback.text();
      const apiFailure = await fetch(`${failingServer.url}/api/runs`);
      const apiFailureJson = await apiFailure.json();

      expect(fallback.status).toBe(200);
      expect(fallbackText).toContain("Build the dashboard app to enable the full UI.");
      expect(apiFailure.status).toBe(500);
      expect(apiFailureJson).toEqual({ error: "run index unavailable" });
    } finally {
      await fallbackServer.close();
      await failingServer.close();
      await store.close();
    }
  });
});

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return response.json();
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(predicate()).toBe(true);
}

function openSse(url: string): Promise<{ request: ClientRequest; response: IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      response.resume();
      resolve({ request, response });
    });
    request.once("error", reject);
  });
}
