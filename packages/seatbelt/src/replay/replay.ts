import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CliIo } from "../cli/io.js";
import { writeLine } from "../cli/io.js";
import { defaultSeatbeltRoot, JsonlEventStore, type LatestRunPointer } from "../logging/event-store.js";

export interface ReplayOptions {
  target: string;
  rootDir?: string;
}

export async function runReplay(options: ReplayOptions, io: CliIo): Promise<number> {
  const rootDir = options.rootDir ?? defaultSeatbeltRoot();
  const pointer = options.target === "latest" ? await readLatest(rootDir) : undefined;
  const runId = pointer?.runId ?? stripJsonlExtension(options.target);
  const path = pointer?.path ?? resolve(options.target);
  const store = await JsonlEventStore.create({ rootDir, runId: `replay-view-${Date.now()}` });
  const events = options.target === "latest" ? await store.readEvents(runId) : await readEventsFromPath(path);

  writeLine(io.stdout, `Run ${runId}`);
  if (events.length === 0) {
    writeLine(io.stdout, "No events found.");
    await store.close();
    return 0;
  }

  for (const event of events) {
    const rules = event.ruleIds.length > 0 ? ` rules=${event.ruleIds.join(",")}` : "";
    writeLine(io.stdout, `${event.timestamp} ${event.decision} ${event.direction} ${event.method ?? "-"}${rules}`);
  }
  await store.close();
  return 0;
}

async function readLatest(rootDir: string): Promise<LatestRunPointer> {
  const raw = await readFile(join(rootDir, "latest.json"), "utf8");
  return JSON.parse(raw) as LatestRunPointer;
}

async function readEventsFromPath(path: string) {
  const raw = await readFile(path, "utf8");
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function stripJsonlExtension(value: string): string {
  return value.replace(/\.jsonl$/, "");
}
