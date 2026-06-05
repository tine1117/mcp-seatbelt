import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "../src/App";
import { cleanupRender, flushReact, getByAriaLabel, renderComponent } from "./render-helper";
import {
  createDashboardFixtures,
  installDashboardApi,
  installInspectableEventSource,
  installSilentEventSource
} from "./dashboard-test-support";

afterEach(async () => {
  await cleanupRender();
  vi.restoreAllMocks();
});

describe("dashboard failure states", () => {
  it("renders a connection error with endpoint context when an API request fails", async () => {
    installApiFailure("/api/runs", 503);

    const { document } = await renderComponent(<App />);
    await flushReact();

    expect(document.querySelector(".load-error")?.textContent).toBe(
      "Dashboard connection issue: /api/runs request failed: 503"
    );
    expect(getByAriaLabel(document, "Effective seatbelt config").textContent).toContain("F:/tmp/project");
    expect(getByAriaLabel(document, "Runs").textContent).toContain("No run selected");
    expect(getByAriaLabel(document, "MCP event timeline").textContent).toContain("No events match this filter.");
  });

  it("renders a stream failure state and closes the EventSource connection", async () => {
    const eventSources = installSuccessfulApiWithInspectableStream();

    const { document, window } = await renderComponent(<App />);
    await flushReact();

    expect(eventSources).toHaveLength(1);
    await act(async () => {
      eventSources[0]?.onerror?.();
      await Promise.resolve();
    });

    expect(eventSources[0]?.close).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".load-error")?.textContent).toBe(
      "Dashboard connection issue: Live event stream disconnected for run-1. Reconnecting..."
    );
    expect(getByAriaLabel(document, "MCP event timeline").textContent).toContain("tools/list");
    expect(window.document.body.textContent).toContain("run-1");
  });
});

function installApiFailure(failingUrl: string, status: number): void {
  installDashboardApi(createDashboardFixtures(), { failures: { [failingUrl]: status } });
  installSilentEventSource();
}

function installSuccessfulApiWithInspectableStream() {
  installDashboardApi();
  return installInspectableEventSource();
}
