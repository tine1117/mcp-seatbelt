import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { JsonlEventStore, type EventStoreWriteFailure } from "../logging/event-store.js";
import type { JsonRpcMessage } from "../types/json-rpc.js";
import type { SeatbeltMode } from "../types/options.js";
import { JsonLineBuffer, serializeJsonRpcMessage } from "./json-rpc.js";
import { SeatbeltMessageHandler, type SeatbeltHandlerEffect } from "./message-handler.js";

export interface StdioSeatbeltProxyOptions {
  command: string;
  args: string[];
  mode: SeatbeltMode;
  root: string;
  allowlistPaths: string[];
  store: JsonlEventStore;
  stdin?: Readable;
  stdout?: Pick<Writable, "write">;
  stderr?: Pick<Writable, "write">;
  env?: NodeJS.ProcessEnv;
}

export class StdioSeatbeltProxy {
  private readonly handler: SeatbeltMessageHandler;
  private readonly clientBuffer = new JsonLineBuffer();
  private readonly serverBuffer = new JsonLineBuffer();
  private readonly onLogWriteFailure = (failure: EventStoreWriteFailure): void => {
    this.writeOperationalLog(`mcp-seatbelt: failed to write event log: ${failure.error.message}\n`);
  };
  private child?: ChildProcessWithoutNullStreams;
  private exitPromise?: Promise<number>;

  constructor(private readonly options: StdioSeatbeltProxyOptions) {
    this.handler = new SeatbeltMessageHandler({
      mode: options.mode,
      root: options.root,
      allowlistPaths: options.allowlistPaths,
      runId: options.store.runId
    });
    this.options.store.on("write_error", this.onLogWriteFailure);
  }

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    const child = spawn(this.options.command, this.options.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.options.env },
      windowsHide: true
    });
    this.child = child;
    this.exitPromise = new Promise((resolve) => {
      child.once("exit", (code) => resolve(code ?? 0));
    });

    const stdin = this.options.stdin ?? process.stdin;
    stdin.on("data", (chunk: Buffer) => this.handleClientData(chunk));
    stdin.on("end", () => child.stdin.end());

    child.stdout.on("data", (chunk: Buffer) => this.handleServerData(chunk));
    child.stderr.on("data", (chunk: Buffer) => this.handleChildStderr(chunk));
    child.on("error", (error) => {
      this.writeOperationalLog(`mcp-seatbelt: child process error: ${error.message}\n`);
      this.applyEffects(this.handler.handleInternal("error", "child_process_error", error.message));
    });
    child.on("exit", (code, signal) => {
      this.applyEffects(this.handler.handleInternal("allowed", "child_exit", `child exited with code ${code ?? "null"} signal ${signal ?? "null"}`));
    });
  }

  async waitForExit(): Promise<number> {
    return this.exitPromise ?? 0;
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 100);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.stdin.end();
    });
    this.options.store.off("write_error", this.onLogWriteFailure);
    this.child = undefined;
  }

  private handleClientData(chunk: Buffer): void {
    const child = this.child;
    if (!child) {
      return;
    }

    for (const record of this.clientBuffer.push(chunk)) {
      this.applyEffects(this.handler.handleClientLine(record.line), child);
    }
  }

  private handleServerData(chunk: Buffer): void {
    for (const record of this.serverBuffer.push(chunk)) {
      this.applyEffects(this.handler.handleServerLine(record.line));
    }
  }

  private handleChildStderr(chunk: Buffer): void {
    this.applyEffects(this.handler.handleChildStderr(chunk.toString("utf8")));
  }

  private applyEffects(effects: SeatbeltHandlerEffect[], child = this.child): void {
    for (const effect of effects) {
      if (effect.operationalLog) {
        this.writeOperationalLog(effect.operationalLog);
      }
      if (effect.clientMessage) {
        this.writeToClient(effect.clientMessage);
      }
      if (effect.serverLine && child) {
        child.stdin.write(`${effect.serverLine}\n`);
      }
      if (effect.event) {
        void this.options.store.append(effect.event);
      }
    }
  }

  private writeToClient(message: JsonRpcMessage): void {
    const stdout = this.options.stdout ?? process.stdout;
    stdout.write(serializeJsonRpcMessage(message));
  }

  private writeOperationalLog(text: string): void {
    const stderr = this.options.stderr ?? process.stderr;
    stderr.write(text);
  }
}
