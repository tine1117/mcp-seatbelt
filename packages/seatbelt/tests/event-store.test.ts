import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlEventStore } from "../src/logging/event-store.js";

describe("JsonlEventStore", () => {
  it("writes redacted JSONL events and updates latest pointer", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-store-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "run-test" });

    await store.append({
      schemaVersion: 1,
      runId: "run-test",
      timestamp: "2026-06-05T00:00:00.000Z",
      direction: "client_to_server",
      method: "tools/list",
      decision: "allowed",
      ruleIds: [],
      messageRedacted: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    await store.close();

    const jsonl = await readFile(join(root, "runs", "run-test.jsonl"), "utf8");
    const latest = await readFile(join(root, "latest.json"), "utf8");

    expect(jsonl.trim()).toContain('"method":"tools/list"');
    expect(JSON.parse(latest)).toMatchObject({ runId: "run-test" });
  });

  it("recovers after a write failure and reports the failed write", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-store-recover-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "recover-run" });
    const failures: Error[] = [];
    store.on("write_error", (failure) => {
      failures.push(failure.error);
    });

    await rm(join(root, "runs"), { recursive: true, force: true });
    await store.append(createEvent("first"));
    await mkdir(join(root, "runs"), { recursive: true });
    await store.append(createEvent("second"));
    await store.close();

    const jsonl = await readFile(join(root, "runs", "recover-run.jsonl"), "utf8");
    expect(failures.length).toBeGreaterThan(0);
    expect(jsonl).toContain('"method":"second"');
  });
});

function createEvent(method: string) {
  return {
    schemaVersion: 1 as const,
    runId: "recover-run",
    timestamp: "2026-06-05T00:00:00.000Z",
    direction: "internal" as const,
    method,
    decision: "allowed" as const,
    ruleIds: [],
    messageRedacted: { ok: true }
  };
}
