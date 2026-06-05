import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { EventInspector } from "../src/components/EventInspector";
import type { SeatbeltEvent } from "../src/types";
import { cleanupRender, renderComponent } from "./render-helper";

afterEach(async () => {
  await cleanupRender();
  vi.restoreAllMocks();
});

describe("event inspector accessibility and copy UX", () => {
  it("renders accessible payload and snippet regions for keyboard users", async () => {
    const { document } = await renderComponent(<EventInspector event={blockedEvent()} />);
    const payload = document.querySelector<HTMLElement>('[aria-label="Redacted JSON-RPC payload"]');
    const snippet = document.querySelector<HTMLElement>('[aria-label="Client config snippet"]');

    expect(document.querySelector("#event-inspector-title")?.textContent).toBe("Event detail");
    expect(payload?.getAttribute("tabindex")).toBe("0");
    expect(payload?.getAttribute("aria-describedby")).toBe("event-json-help");
    expect(payload?.textContent).toContain("read_file");
    expect(snippet?.getAttribute("tabindex")).toBe("0");
    expect(snippet?.textContent).toContain("mcp-seatbelt");
  });

  it("copies the selected redacted payload with mouse and keyboard interactions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { document, window } = await renderComponent(<EventInspector event={blockedEvent()} />, {
      clipboard: { writeText }
    });
    const copyJsonButton = document.querySelector<HTMLButtonElement>('[aria-label="Copy redacted JSON"]');

    await act(async () => {
      copyJsonButton?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("\"method\": \"tools/call\""));
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Copy redacted JSON copied.");

    await act(async () => {
      copyJsonButton?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("announces copy failures from rendered controls", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    const { document, window } = await renderComponent(<EventInspector event={blockedEvent()} />, {
      clipboard: { writeText }
    });
    const copyConfigButton = document.querySelector<HTMLButtonElement>('[aria-label="Copy config snippet"]');

    await act(async () => {
      copyConfigButton?.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("\"command\": \"mcp-seatbelt\""));
    expect([...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === "Copy config snippet could not be copied.")).toBe(true);
  });
});

function blockedEvent(): SeatbeltEvent {
  return {
    schemaVersion: 1,
    runId: "run-1",
    timestamp: "2026-06-05T00:00:01.000Z",
    direction: "client_to_server",
    method: "tools/call",
    toolName: "read_file",
    decision: "blocked",
    ruleIds: ["sensitive-path"],
    reason: "sensitive local path matched: .env",
    messageRedacted: {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: {
          path: "[REDACTED:path]"
        }
      }
    }
  };
}
