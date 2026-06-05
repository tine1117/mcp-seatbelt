import { describe, expect, it } from "vitest";
import { JsonLineBuffer, parseJsonRpcLine, serializeJsonRpcMessage } from "../src/proxy/json-rpc.js";

describe("JSON-RPC line parsing", () => {
  it("parses one valid newline-delimited JSON-RPC message", () => {
    const message = parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');

    expect(message).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  });

  it("buffers partial chunks until a newline arrives", () => {
    const buffer = new JsonLineBuffer();

    expect(buffer.push(Buffer.from('{"jsonrpc":"2.0"'))).toEqual([]);
    expect(buffer.push(Buffer.from(',"id":2,"method":"ping"}\n'))).toEqual([
      { line: '{"jsonrpc":"2.0","id":2,"method":"ping"}' }
    ]);
  });

  it("keeps incomplete trailing data for the next chunk", () => {
    const buffer = new JsonLineBuffer();
    const records = buffer.push(Buffer.from('{"jsonrpc":"2.0","id":1}\n{"jsonrpc":"2.0"'));

    expect(records).toEqual([{ line: '{"jsonrpc":"2.0","id":1}' }]);
    expect(buffer.flush()).toEqual('{"jsonrpc":"2.0"');
  });

  it("serializes messages as newline-delimited JSON", () => {
    expect(serializeJsonRpcMessage({ jsonrpc: "2.0", id: "a", result: { ok: true } })).toBe(
      '{"jsonrpc":"2.0","id":"a","result":{"ok":true}}\n'
    );
  });
});
