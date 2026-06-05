import type { Readable, Writable } from "node:stream";

export interface CliIo {
  stdin: Readable;
  stdout: Pick<Writable, "write">;
  stderr: Pick<Writable, "write">;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

export function defaultCliIo(): CliIo {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    cwd: process.cwd()
  };
}

export function writeLine(stream: Pick<Writable, "write">, line = ""): void {
  stream.write(`${line}\n`);
}
