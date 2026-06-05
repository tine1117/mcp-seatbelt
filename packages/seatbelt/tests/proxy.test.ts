import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonlEventStore } from "../src/logging/event-store.js";
import { StdioSeatbeltProxy } from "../src/proxy/stdio-proxy.js";

const FAKE_OPENAI_KEY = ["sk", "proj", "seatbeltproxyfixture000000"].join("-");

describe("StdioSeatbeltProxy", () => {
  it("blocks high-risk tool calls before they reach the child server", async () => {
    const fixture = await createFakeServer();
    const store = await JsonlEventStore.create({ rootDir: fixture.root, runId: "proxy-block" });
    const io = createProxyIo();
    const proxy = new StdioSeatbeltProxy({
      command: process.execPath,
      args: [fixture.serverPath, fixture.touchedPath],
      mode: "protect",
      root: fixture.root,
      allowlistPaths: [],
      store,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr
    });

    await proxy.start();
    io.stdin.write(jsonLine({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "read_file", arguments: { path: ".env" } } }));

    const response = await readJsonLine(io.stdout);
    await proxy.stop();
    await store.close();

    expect(response).toMatchObject({ id: 7, error: { code: -32001 } });
    expect(existsSync(fixture.touchedPath)).toBe(false);
    const events = await store.readEvents();
    expect(events.some((event) => event.decision === "blocked" && event.ruleIds.includes("sensitive-path"))).toBe(true);
  });

  it("redacts secrets from server responses before forwarding and logging", async () => {
    const fixture = await createFakeServer();
    const store = await JsonlEventStore.create({ rootDir: fixture.root, runId: "proxy-redact" });
    const io = createProxyIo();
    const proxy = new StdioSeatbeltProxy({
      command: process.execPath,
      args: [fixture.serverPath, fixture.touchedPath],
      mode: "protect",
      root: fixture.root,
      allowlistPaths: [],
      store,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr
    });

    await proxy.start();
    io.stdin.write(jsonLine({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "echo_secret", arguments: {} } }));

    const response = await readJsonLine(io.stdout);
    await proxy.stop();
    await store.close();
    const logText = await readFile(join(fixture.root, "runs", "proxy-redact.jsonl"), "utf8");

    expect(JSON.stringify(response)).not.toContain(FAKE_OPENAI_KEY);
    expect(JSON.stringify(response)).toContain("[REDACTED:openai]");
    expect(logText).not.toContain(FAKE_OPENAI_KEY);
  });

  it("continues relaying MCP messages and reports log write failures", async () => {
    const fixture = await createFakeServer();
    const store = await JsonlEventStore.create({ rootDir: fixture.root, runId: "proxy-log-failure" });
    await rm(join(fixture.root, "runs"), { recursive: true, force: true });
    const io = createProxyIo();
    const proxy = new StdioSeatbeltProxy({
      command: process.execPath,
      args: [fixture.serverPath, fixture.touchedPath],
      mode: "protect",
      root: fixture.root,
      allowlistPaths: [],
      store,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr
    });

    await proxy.start();
    io.stdin.write(jsonLine({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "safe_read", arguments: { path: "README.md" } } }));

    const response = await readJsonLine(io.stdout);
    const stderr = await readStreamText(io.stderr, "failed to write event log");
    await proxy.stop();
    await store.close();

    expect(response).toMatchObject({ id: 9, result: { ok: true } });
    expect(stderr).toContain("mcp-seatbelt: failed to write event log");
  });
});

function createProxyIo(): { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough } {
  return {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough()
  };
}

async function createFakeServer(): Promise<{ root: string; serverPath: string; touchedPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "seatbelt-proxy-"));
  const serverPath = join(root, "fake-mcp-server.mjs");
  const touchedPath = join(root, "touched.txt");
  await writeFile(
    serverPath,
    `
import { appendFileSync } from "node:fs";
import readline from "node:readline";

const touchedPath = process.argv[2];
const fakeOpenAiKey = ${JSON.stringify(FAKE_OPENAI_KEY)};
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "tools/call") {
    appendFileSync(touchedPath, message.params.name + "\\n", "utf8");
    if (message.params.name === "echo_secret") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "key " + fakeOpenAiKey }] } }) + "\\n");
      return;
    }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }) + "\\n");
});
`,
    "utf8"
  );
  return { root, serverPath, touchedPath };
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function readJsonLine(stream: PassThrough): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      const index = buffer.indexOf("\n");
      if (index >= 0) {
        stream.off("data", onData);
        const line = buffer.slice(0, index);
        try {
          resolve(JSON.parse(line) as Record<string, unknown>);
        } catch (error) {
          reject(error);
        }
      }
    };
    stream.on("data", onData);
  });
}

function readStreamText(stream: PassThrough, expected: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      stream.off("data", onData);
      reject(new Error(`Timed out waiting for ${expected}`));
    }, 2000);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      if (buffer.includes(expected)) {
        clearTimeout(timer);
        stream.off("data", onData);
        resolve(buffer);
      }
    };
    stream.on("data", onData);
  });
}
