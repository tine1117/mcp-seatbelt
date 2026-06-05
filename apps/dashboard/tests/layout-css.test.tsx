import { afterEach, describe, expect, it, vi } from "vitest";
import type { JSDOM } from "jsdom";
import { App } from "../src/App";
import { cleanupRender, flushReact, getByAriaLabel, getButtonByText, renderComponent } from "./render-helper";
import { installDashboardApi, installSilentEventSource } from "./dashboard-test-support";

afterEach(async () => {
  await cleanupRender();
  vi.restoreAllMocks();
});

describe("dashboard responsive containment", () => {
  it("renders the shell with internal scroll containers and loaded dashboard data", async () => {
    installDashboardApi();
    installSilentEventSource();
    const { document, window } = await renderComponent(<App />, { withStyles: true });
    await flushReact();

    const backdrop = document.querySelector<HTMLElement>(".dashboard-backdrop");
    const windowShell = document.querySelector<HTMLElement>(".dashboard-window");
    const eventScroll = document.querySelector<HTMLElement>(".event-table-scroll");

    expect(backdrop).not.toBeNull();
    expect(windowShell).not.toBeNull();
    expect(getByAriaLabel(document, "Effective seatbelt config").textContent).toContain("F:/tmp/project");
    expect(getByAriaLabel(document, "Runs").textContent).toContain("run-1");
    expect(window.getComputedStyle(document.body).overflow).toBe("hidden");
    expect(window.getComputedStyle(backdrop!).overflow).toBe("hidden");
    expect(window.getComputedStyle(eventScroll!).overflow).toBe("auto");
  });

  it("filters rendered events through the real filter controls", async () => {
    installDashboardApi();
    installSilentEventSource();
    const { document, window } = await renderComponent(<App />);
    await flushReact();

    expect(document.body.textContent).toContain("tools/list");
    expect(document.body.textContent).toContain("tools/call");

    const blockedFilter = getButtonByText(document, "Blocked");
    await actClick(window, blockedFilter);

    expect(blockedFilter?.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("sensitive-path");
    expect(document.body.textContent).not.toContain("tools/list");
    expect(document.querySelector('[aria-label="Redacted JSON-RPC payload"]')?.textContent).toContain("read_file");
  });
});

async function actClick(window: JSDOM["window"], button: HTMLButtonElement | null): Promise<void> {
  const { act } = await import("react");
  await act(async () => {
    button?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}
