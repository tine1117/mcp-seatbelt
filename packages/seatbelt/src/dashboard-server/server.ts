import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { SeatbeltConfigStatus, SeatbeltOptionSource } from "../config/seatbelt-config.js";
import type { JsonlEventStore } from "../logging/event-store.js";
import type { SeatbeltEvent } from "../types/events.js";
import type { SeatbeltMode } from "../types/options.js";

type DashboardSchemaStatus = "missing" | "matched" | "mismatched" | "unknown";
type DashboardRoute =
  | { kind: "config" }
  | { kind: "runs" }
  | { kind: "events"; runId: string }
  | { kind: "summary"; runId: string }
  | { kind: "stream"; runId?: string }
  | { kind: "static"; pathname: string };

export interface DashboardSeatbeltConfig {
  path: string;
  status: SeatbeltConfigStatus;
  effective: {
    mode: SeatbeltMode;
    root: string;
    allowlist: {
      paths: string[];
    };
  };
  sources: {
    mode: SeatbeltOptionSource;
    root: SeatbeltOptionSource;
    allowlist: Exclude<SeatbeltOptionSource, "cli">;
  };
  schema: {
    expected: "../docs/seatbelt.config.schema.json";
    declared?: string;
    status: DashboardSchemaStatus;
  };
  error?: string;
}

export interface DashboardServerOptions {
  store: JsonlEventStore;
  host?: string;
  port?: number;
  staticDir?: string;
  config?: DashboardSeatbeltConfig;
}

export interface DashboardServerHandle {
  url: string;
  close(): Promise<void>;
}

export async function startDashboardServer(options: DashboardServerOptions): Promise<DashboardServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const server = createServer((request, response) => {
    void routeRequest(request, response, options);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }
          resolveClose();
        });
      })
  };
}

async function routeRequest(request: IncomingMessage, response: ServerResponse, options: DashboardServerOptions): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  try {
    await handleDashboardRoute(matchDashboardRoute(url), request, response, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown dashboard error";
    sendJson(response, { error: message }, 500);
  }
}

async function handleDashboardRoute(
  route: DashboardRoute,
  request: IncomingMessage,
  response: ServerResponse,
  options: DashboardServerOptions
): Promise<void> {
  switch (route.kind) {
    case "config":
      sendJson(response, options.config ?? createDefaultDashboardConfig());
      return;
    case "runs":
      sendJson(response, await options.store.listRuns());
      return;
    case "events":
      sendJson(response, await options.store.readEvents(route.runId));
      return;
    case "summary":
      sendJson(response, await options.store.summarize(route.runId));
      return;
    case "stream":
      await handleEventStream(request, response, options.store, route.runId);
      return;
    case "static":
      await serveStaticOrFallback(route.pathname, response, options.staticDir);
      return;
  }
}

function matchDashboardRoute(url: URL): DashboardRoute {
  if (url.pathname === "/api/config") {
    return { kind: "config" };
  }
  if (url.pathname === "/api/runs") {
    return { kind: "runs" };
  }

  const eventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (eventsMatch?.[1]) {
    return { kind: "events", runId: decodeURIComponent(eventsMatch[1]) };
  }

  const summaryMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/summary$/);
  if (summaryMatch?.[1]) {
    return { kind: "summary", runId: decodeURIComponent(summaryMatch[1]) };
  }

  if (url.pathname === "/api/events/stream") {
    return { kind: "stream", runId: url.searchParams.get("runId") ?? undefined };
  }

  return { kind: "static", pathname: url.pathname };
}

function createDefaultDashboardConfig(): DashboardSeatbeltConfig {
  return {
    path: resolve(process.cwd(), "seatbelt.config.json"),
    status: "missing",
    effective: {
      mode: "protect",
      root: process.cwd(),
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
  };
}

function sendJson(response: ServerResponse, value: unknown, statusCode = 200): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}

async function handleEventStream(
  request: IncomingMessage,
  response: ServerResponse,
  store: JsonlEventStore,
  runId?: string
): Promise<void> {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive"
  });
  response.write(": connected\n\n");

  const listener = (event: SeatbeltEvent): void => {
    if (!runId || event.runId === runId) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };
  store.on("event", listener);
  request.on("close", () => {
    store.off("event", listener);
  });
}

async function serveStaticOrFallback(pathname: string, response: ServerResponse, staticDir?: string): Promise<void> {
  if (!staticDir) {
    sendFallbackHtml(response);
    return;
  }

  const candidate = safeStaticPath(staticDir, pathname === "/" ? "/index.html" : pathname);
  if (!candidate || !existsSync(candidate) || !(await stat(candidate)).isFile()) {
    const indexPath = safeStaticPath(staticDir, "/index.html");
    if (indexPath && existsSync(indexPath)) {
      streamFile(indexPath, response);
      return;
    }
    sendFallbackHtml(response);
    return;
  }

  streamFile(candidate, response);
}

function safeStaticPath(staticDir: string, pathname: string): string | undefined {
  const root = resolve(staticDir);
  const candidate = resolve(root, `.${normalize(decodeURIComponent(pathname))}`);
  return candidate.startsWith(root) ? candidate : undefined;
}

function streamFile(path: string, response: ServerResponse): void {
  response.writeHead(200, {
    "content-type": contentType(path)
  });
  createReadStream(path).pipe(response);
}

function sendFallbackHtml(response: ServerResponse): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>mcp-seatbelt</title></head>
  <body><main><h1>mcp-seatbelt dashboard</h1><p>Build the dashboard app to enable the full UI.</p></main></body>
</html>`);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
