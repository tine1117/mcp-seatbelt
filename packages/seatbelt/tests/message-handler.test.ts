import { describe, expect, it } from "vitest";
import { SeatbeltMessageHandler } from "../src/proxy/message-handler.js";

describe("SeatbeltMessageHandler", () => {
  it("records deterministic latency and clears pending methods after matching responses", () => {
    let now = Date.parse("2026-06-05T00:00:00.000Z");
    const handler = new SeatbeltMessageHandler({
      mode: "protect",
      root: "/workspace/project",
      allowlistPaths: [],
      runId: "handler-run",
      now: () => now
    });

    const clientEffects = handler.handleClientLine(jsonLine({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "read_file", arguments: { path: "README.md" } }
    }));

    now += 250;
    const firstResponseEffects = handler.handleServerLine(jsonLine({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true }
    }));

    now += 250;
    const duplicateResponseEffects = handler.handleServerLine(jsonLine({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true }
    }));

    expect(clientEffects[0]).toMatchObject({
      serverLine: expect.stringContaining("\"tools/call\""),
      event: {
        direction: "client_to_server",
        method: "tools/call",
        latencyMs: undefined
      }
    });
    expect(firstResponseEffects[0]).toMatchObject({
      clientMessage: { id: 1, result: { ok: true } },
      event: {
        direction: "server_to_client",
        method: "tools/call",
        latencyMs: 250
      }
    });
    expect(duplicateResponseEffects[0]).toMatchObject({
      clientMessage: { id: 1, result: { ok: true } },
      event: {
        direction: "server_to_client",
        method: undefined,
        latencyMs: undefined
      }
    });
  });

  it("returns client errors and events for invalid client frames and oversized server frames", () => {
    const handler = new SeatbeltMessageHandler({
      mode: "protect",
      root: "/workspace/project",
      allowlistPaths: [],
      runId: "handler-errors",
      now: () => Date.parse("2026-06-05T00:00:00.000Z"),
      hardCapBytes: 20
    });

    const invalidClient = handler.handleClientLine("{ invalid json");
    const oversizedServer = handler.handleServerLine(`${"x".repeat(21)}\n`);

    expect(invalidClient[0]).toMatchObject({
      clientMessage: { error: { code: -32700 } },
      event: {
        direction: "client_to_server",
        decision: "error",
        ruleIds: []
      }
    });
    expect(oversizedServer[0]).toMatchObject({
      clientMessage: { error: { code: -32002 } },
      event: {
        direction: "server_to_client",
        decision: "error",
        ruleIds: ["response-hard-cap"]
      }
    });
  });
});

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
