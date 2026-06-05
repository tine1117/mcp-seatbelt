import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigPanel } from "../src/components/ConfigPanel";
import type { DashboardConfig, SeatbeltSchemaStatus } from "../src/types";
import { cleanupRender, renderComponent } from "./render-helper";

afterEach(async () => {
  await cleanupRender();
  vi.restoreAllMocks();
});

describe("ConfigPanel rendering behavior", () => {
  it("shows the schema fix action only for missing or mismatched schema declarations", async () => {
    expect(await renderButtonText("missing")).toContain("Copy schema fix");
    expect(await renderButtonText("mismatched")).toContain("Copy schema fix");
    expect(await renderButtonText("matched")).not.toContain("Copy schema fix");
    expect(await renderButtonText("unknown")).not.toContain("Copy schema fix");
  });

  it("copies the minimal schema fix snippet and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { document, window } = await renderPanel("missing", writeText);
    const button = document.querySelector("button");

    expect(button?.textContent).toBe("Copy schema fix");
    await act(async () => {
      button?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('  "$schema": "../docs/seatbelt.config.schema.json",');
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Copied");
  });

  it("announces copy failures without hiding the schema fix action", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    const { document, window } = await renderPanel("mismatched", writeText);
    const button = document.querySelector("button");

    await act(async () => {
      button?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Copy failed");
    expect(document.body.textContent).toContain("Copy schema fix");
  });
});

async function renderButtonText(status: SeatbeltSchemaStatus): Promise<string> {
  const { document } = await renderPanel(status, vi.fn().mockResolvedValue(undefined));
  return document.body.textContent ?? "";
}

async function renderPanel(status: SeatbeltSchemaStatus, writeText: (value: string) => Promise<void>) {
  return renderComponent(<ConfigPanel config={createConfig(status)} />, {
    clipboard: { writeText }
  });
}

function createConfig(status: SeatbeltSchemaStatus): DashboardConfig {
  return {
    path: "F:/tmp/seatbelt.config.json",
    status: "loaded",
    effective: {
      mode: "strict",
      root: "F:/tmp",
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
      declared: status === "mismatched" ? "https://example.com/schema.json" : status === "matched" ? "../docs/seatbelt.config.schema.json" : undefined,
      status
    }
  };
}
