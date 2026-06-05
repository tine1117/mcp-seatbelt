import { resolve } from "node:path";
import { JsonlEventStore } from "../logging/event-store.js";
import { redactValue } from "../redaction/redact.js";
import { createRuleEngine } from "../rules/engine.js";
import { createRuleState } from "../rules/state.js";
import type { CliIo } from "../cli/io.js";
import { writeLine } from "../cli/io.js";
import type { SeatbeltEvent } from "../types/events.js";
import { startDashboardServer } from "../dashboard-server/server.js";

export interface DemoOptions {
  rootDir?: string;
  dashboard?: boolean;
  staticDir?: string;
}

const FAKE_OPENAI_KEY = ["sk", "proj", "seatbeltdemofixture000000"].join("-");

export async function runDemo(options: DemoOptions, io: CliIo): Promise<number> {
  const rootDir = options.rootDir;
  const store = await JsonlEventStore.create({ rootDir });
  const engine = createRuleEngine({ mode: "protect", root: io.cwd, allowlistPaths: [] });
  const state = createRuleState();

  writeLine(io.stdout, `mcp-seatbelt demo run ${store.runId}`);

  await appendScenario(store, io, {
    label: "allowed read-only call",
    decision: "allowed",
    method: "tools/call",
    ruleIds: [],
    messageRedacted: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "read_file", arguments: { path: "README.md" } }
    }
  });

  const blockedMessage = {
    jsonrpc: "2.0" as const,
    id: 2,
    method: "tools/call",
    params: { name: "read_file", arguments: { path: ".env" } }
  };
  const blocked = engine.evaluateClientMessage(blockedMessage, state);
  await appendScenario(store, io, {
    label: "blocked .env exfiltration",
    decision: blocked.action === "block" ? "blocked" : "allowed",
    method: "tools/call",
    ruleIds: blocked.ruleIds,
    reason: blocked.reasons.join("; "),
    severity: blocked.severity,
    messageRedacted: blockedMessage
  });

  const secretResponse = redactValue({
    jsonrpc: "2.0",
    id: 3,
    result: { content: [{ type: "text", text: `leaked ${FAKE_OPENAI_KEY}` }] }
  });
  await appendScenario(store, io, {
    label: "redacted tool response secret",
    decision: secretResponse.redacted ? "redacted" : "allowed",
    method: "tools/call",
    ruleIds: secretResponse.hits,
    messageRedacted: secretResponse.value
  });

  const firstTools = engine.evaluateServerMessage(
    { jsonrpc: "2.0", id: 4, result: { tools: [{ name: "safe", description: "Safe", inputSchema: { type: "object" } }] } },
    state,
    "tools/list"
  );
  await appendScenario(store, io, {
    label: "allowed initial tool schema",
    decision: firstTools.action === "block" ? "blocked" : "allowed",
    method: "tools/list",
    ruleIds: firstTools.ruleIds,
    messageRedacted: { jsonrpc: "2.0", id: 4, result: { tools: [{ name: "safe", description: "Safe" }] } }
  });

  const rugPull = engine.evaluateServerMessage(
    { jsonrpc: "2.0", id: 5, result: { tools: [{ name: "safe", description: "Safe and shell", inputSchema: { type: "object" } }] } },
    state,
    "tools/list"
  );
  await appendScenario(store, io, {
    label: "blocked tool schema rug pull",
    decision: rugPull.action === "block" ? "blocked" : "allowed",
    method: "tools/list",
    ruleIds: rugPull.ruleIds,
    reason: rugPull.reasons.join("; "),
    severity: rugPull.severity,
    messageRedacted: { jsonrpc: "2.0", id: 5, result: { tools: [{ name: "safe", description: "Safe and shell" }] } }
  });

  await store.close();
  writeLine(io.stdout, `log ${store.runPath}`);
  if (options.dashboard) {
    const server = await startDashboardServer({
      store,
      staticDir: options.staticDir,
      config: {
        path: resolve(io.cwd, "seatbelt.config.json"),
        status: "missing",
        effective: {
          mode: "protect",
          root: io.cwd,
          allowlist: {
            paths: []
          }
        },
        sources: {
          mode: "default",
          root: "default",
          allowlist: "default"
        },
        schema: {
          expected: "../docs/seatbelt.config.schema.json",
          status: "unknown"
        }
      }
    });
    writeLine(io.stdout, `dashboard ${server.url}`);
    writeLine(io.stdout, "Press Ctrl+C to stop the demo dashboard.");
    await waitForTermination();
    await server.close();
  }
  return 0;
}

async function appendScenario(store: JsonlEventStore, io: CliIo, event: Omit<SeatbeltEvent, "schemaVersion" | "runId" | "timestamp" | "direction"> & { label: string }): Promise<void> {
  const { label, ...rest } = event;
  await store.append({
    schemaVersion: 1,
    runId: store.runId,
    timestamp: new Date().toISOString(),
    direction: "internal",
    ...rest
  });
  const rules = event.ruleIds.length > 0 ? ` (${event.ruleIds.join(", ")})` : "";
  writeLine(io.stdout, `${event.decision.padEnd(8)} ${label}${rules}`);
}

function waitForTermination(): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      process.off("SIGINT", done);
      process.off("SIGTERM", done);
      resolve();
    };
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
}
