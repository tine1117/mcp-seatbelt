import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { cleanupRender, flushReact, getByAriaLabel, renderComponent } from "./render-helper";
import {
  createAllowedEvent,
  createDashboardFixtures,
  createRun,
  createSummary,
  installDashboardApi,
  installInspectableEventSource,
  installSilentEventSource
} from "./dashboard-test-support";

afterEach(async () => {
  vi.useRealTimers();
  await cleanupRender();
  vi.restoreAllMocks();
});

describe("dashboard loading, empty, and recovery states", () => {
  it("renders loading states until the runs and events responses resolve", async () => {
    installDashboardApi(createDashboardFixtures(), { pending: ["/api/runs"] });
    installSilentEventSource();

    const { document } = await renderComponent(<App />);

    expect(getByAriaLabel(document, "Runs").textContent).toContain("Loading runs...");
    expect(getByAriaLabel(document, "MCP event timeline").textContent).toContain("Loading events...");
    expect(getByAriaLabel(document, "Runs").textContent).not.toContain("No runs yet");
  });

  it("renders an empty dashboard without opening a stream when no runs exist", async () => {
    const eventSources = installInspectableEventSource();
    installDashboardApi(
      createDashboardFixtures({
        runs: [],
        eventsByRunId: {},
        summariesByRunId: {}
      })
    );

    const { document } = await renderComponent(<App />);
    await flushReact();

    expect(getByAriaLabel(document, "Runs").textContent).toContain("No runs yet");
    expect(getByAriaLabel(document, "Current run summary").textContent).toContain("No run selected");
    expect(getByAriaLabel(document, "MCP event timeline").textContent).toContain("No events match this filter.");
    expect(eventSources).toHaveLength(0);
  });

  it("renders an empty event state for a selected run with no events", async () => {
    const run = createRun("empty-run");
    installSilentEventSource();
    installDashboardApi(
      createDashboardFixtures({
        runs: [run],
        eventsByRunId: { [run.runId]: [] },
        summariesByRunId: { [run.runId]: createSummary(run.runId, []) }
      })
    );

    const { document } = await renderComponent(<App />);
    await flushReact();

    expect(getByAriaLabel(document, "Current run summary").textContent).toContain("0 events");
    expect(getByAriaLabel(document, "MCP event timeline").textContent).toContain("No events match this filter.");
    expect(document.querySelector('[aria-labelledby="event-inspector-title"]')?.textContent).toContain("Select an event");
    expect(document.querySelector(".load-error")).toBeNull();
  });

  it("reconnects the event stream and clears the stream error after live events resume", async () => {
    vi.useFakeTimers();
    const eventSources = installInspectableEventSource();
    installDashboardApi();

    const { document } = await renderComponent(<App />);
    await flushReact();

    expect(eventSources).toHaveLength(1);

    await act(async () => {
      eventSources[0]?.onerror?.();
      await Promise.resolve();
    });

    expect(eventSources[0]?.close).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".load-error")?.textContent).toContain(
      "Live event stream disconnected for run-1. Reconnecting..."
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(eventSources).toHaveLength(2);

    await act(async () => {
      eventSources[1]?.onmessage?.({
        data: JSON.stringify({
          ...createAllowedEvent("run-1"),
          timestamp: "2026-06-05T00:00:02.000Z",
          messageRedacted: { jsonrpc: "2.0", id: 99, method: "tools/list" }
        })
      } as MessageEvent);
      await Promise.resolve();
    });

    expect(document.querySelector(".load-error")).toBeNull();
    expect(getByAriaLabel(document, "MCP event timeline").textContent).toContain("tools/list");
  });
});
