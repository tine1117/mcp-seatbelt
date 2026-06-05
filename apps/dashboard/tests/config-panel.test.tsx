import { afterEach, describe, expect, it, vi } from "vitest";
import type { JSDOM } from "jsdom";
import { ConfigPanel, SCHEMA_FIX_SNIPPET } from "../src/components/ConfigPanel";
import { RunSidebar } from "../src/components/RunSidebar";
import type { DashboardConfig } from "../src/types";
import { cleanupRender, renderComponent } from "./render-helper";

afterEach(async () => {
  await cleanupRender();
  vi.restoreAllMocks();
});

describe("dashboard config panel", () => {
  it("renders effective config values through the sidebar component tree", async () => {
    const config = createConfig("mismatched");
    const { document } = await renderComponent(
      <RunSidebar
        runs={[{ runId: "run-1", path: "F:/tmp/run-1.jsonl", startedAt: "2026-06-05T00:00:00.000Z" }]}
        selectedRunId="run-1"
        summary={{ runId: "run-1", startedAt: "2026-06-05T00:00:00.000Z", eventCount: 4, allowedCount: 1, blockedCount: 1, redactedCount: 1, errorCount: 1 }}
        config={config}
        onSelectRun={vi.fn()}
      />
    );

    const panel = document.querySelector<HTMLElement>('[aria-label="Effective seatbelt config"]');

    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Effective config");
    expect(panel?.textContent).toContain("F:/tmp/seatbelt.config.json");
    expect(panel?.textContent).toContain("strict");
    expect(panel?.textContent).toContain("F:/tmp/project");
    expect(panel?.textContent).toContain("F:/shared-readonly");
    expect(panel?.textContent).toContain("mode:config root:config allowlist:config");
    expect(panel?.textContent).toContain("mismatched");
    expect(panel?.textContent).toContain("https://example.com/schema.json");
    expect(document.querySelector('[aria-label="Current run summary"]')?.textContent).toContain("4 events");
  });

  it("copies the schema fix snippet from the rendered action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { document, window } = await renderComponent(<ConfigPanel config={createConfig("missing")} />, {
      clipboard: { writeText }
    });
    const button = document.querySelector<HTMLButtonElement>("button");

    expect(button?.textContent).toBe("Copy schema fix");
    await actClick(window, button);

    expect(writeText).toHaveBeenCalledWith(SCHEMA_FIX_SNIPPET);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Copied");
  });
});

async function actClick(window: JSDOM["window"], button: HTMLButtonElement | null): Promise<void> {
  const { act } = await import("react");
  await act(async () => {
    button?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function createConfig(schemaStatus: DashboardConfig["schema"]["status"]): DashboardConfig {
  return {
    path: "F:/tmp/seatbelt.config.json",
    status: "loaded",
    effective: {
      mode: "strict",
      root: "F:/tmp/project",
      allowlist: {
        paths: ["F:/shared-readonly"]
      }
    },
    sources: {
      mode: "config",
      root: "config",
      allowlist: "config"
    },
    schema: {
      expected: "../docs/seatbelt.config.schema.json",
      declared: schemaStatus === "mismatched" ? "https://example.com/schema.json" : undefined,
      status: schemaStatus
    }
  };
}
