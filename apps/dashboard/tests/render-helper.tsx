import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

interface RenderOptions {
  clipboard?: {
    writeText: (value: string) => Promise<void>;
  };
  withStyles?: boolean;
}

interface RenderResult {
  document: Document;
  window: JSDOM["window"];
}

let currentRoot: Root | undefined;
let currentWindow: JSDOM["window"] | undefined;

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

export async function renderComponent(element: ReactNode, options: RenderOptions = {}): Promise<RenderResult> {
  await cleanupRender();

  const dom = new JSDOM("<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://127.0.0.1"
  });
  currentWindow = dom.window;
  installDomGlobals(dom.window, options.clipboard);

  if (options.withStyles) {
    const style = dom.window.document.createElement("style");
    style.textContent = readFileSync(resolve("src/styles.css"), "utf8");
    dom.window.document.head.append(style);
  }

  const container = dom.window.document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }

  currentRoot = createRoot(container);
  await act(async () => {
    currentRoot?.render(element);
  });

  return { document: dom.window.document, window: dom.window };
}

export async function cleanupRender(): Promise<void> {
  if (currentRoot) {
    await act(async () => {
      currentRoot?.unmount();
    });
  }
  currentRoot = undefined;
  currentWindow?.close();
  currentWindow = undefined;
}

export async function flushReact(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

export function getByAriaLabel<T extends HTMLElement = HTMLElement>(document: Document, label: string): T {
  const element = [...document.querySelectorAll<T>("[aria-label]")].find((node) => node.getAttribute("aria-label") === label);
  if (!element) {
    throw new Error(`Unable to find element with aria-label: ${label}`);
  }
  return element;
}

export function getButtonByText(document: Document, text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text);
  if (!button) {
    throw new Error(`Unable to find button with text: ${text}`);
  }
  return button;
}

function installDomGlobals(window: JSDOM["window"], clipboard?: RenderOptions["clipboard"]): void {
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: window.document, configurable: true });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      clipboard: clipboard ?? {
        writeText: async () => undefined
      }
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "HTMLElement", { value: window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, "MouseEvent", { value: window.MouseEvent, configurable: true });
  Object.defineProperty(globalThis, "KeyboardEvent", { value: window.KeyboardEvent, configurable: true });
  Object.defineProperty(globalThis, "Event", { value: window.Event, configurable: true });
}
