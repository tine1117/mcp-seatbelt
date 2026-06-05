import type { JsonRpcMessage } from "../types/json-rpc.js";

export interface JsonLineRecord {
  line: string;
}

export class JsonLineBuffer {
  private pending = "";

  push(chunk: Buffer): JsonLineRecord[] {
    this.pending += chunk.toString("utf8");
    const lines = this.pending.split(/\r?\n/);
    this.pending = lines.pop() ?? "";
    return lines.filter((line) => line.length > 0).map((line) => ({ line }));
  }

  flush(): string {
    const value = this.pending;
    this.pending = "";
    return value;
  }
}

export function parseJsonRpcLine(line: string): JsonRpcMessage {
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed)) {
    throw new Error("JSON-RPC message must be an object");
  }
  return parsed as JsonRpcMessage;
}

export function serializeJsonRpcMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function createJsonRpcError(id: JsonRpcMessage["id"], code: number, message: string, data?: unknown): JsonRpcMessage {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
