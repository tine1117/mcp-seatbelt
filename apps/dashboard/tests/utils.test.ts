import { describe, expect, it } from "vitest";
import { eventKey, filterEvents } from "../src/utils";
import type { SeatbeltEvent } from "../src/types";

describe("dashboard utils", () => {
  it("filters events by decision", () => {
    const events = [event("allowed"), event("blocked"), event("redacted")];

    expect(filterEvents(events, "blocked")).toEqual([events[1]]);
    expect(filterEvents(events, "all")).toEqual(events);
  });

  it("creates stable event keys from run, timestamp, direction, method, and JSON-RPC id", () => {
    expect(eventKey({ ...event("allowed"), messageRedacted: { id: 12 } }, 0)).toBe(
      "run:2026-06-05T00:00:00.000Z:client_to_server:tools/call:12"
    );
  });
});

function event(decision: SeatbeltEvent["decision"]): SeatbeltEvent {
  return {
    schemaVersion: 1,
    runId: "run",
    timestamp: "2026-06-05T00:00:00.000Z",
    direction: "client_to_server",
    method: "tools/call",
    decision,
    ruleIds: [],
    messageRedacted: { id: 1 }
  };
}
