import { EventEmitter } from "node:events";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SeatbeltEvent, RunSummary } from "../types/events.js";

export interface EventStoreOptions {
  rootDir?: string;
  runId?: string;
}

export interface LatestRunPointer {
  runId: string;
  path: string;
  startedAt: string;
}

export interface EventStoreWriteFailure {
  error: Error;
  event: SeatbeltEvent;
  runPath: string;
}

export class JsonlEventStore extends EventEmitter {
  readonly rootDir: string;
  readonly runId: string;
  readonly runPath: string;
  readonly startedAt: string;

  private queue: Promise<void> = Promise.resolve();

  private constructor(rootDir: string, runId: string, startedAt: string) {
    super();
    this.rootDir = rootDir;
    this.runId = runId;
    this.startedAt = startedAt;
    this.runPath = join(rootDir, "runs", `${runId}.jsonl`);
  }

  static async create(options: EventStoreOptions = {}): Promise<JsonlEventStore> {
    const rootDir = options.rootDir ?? defaultSeatbeltRoot();
    const runId = options.runId ?? createRunId();
    const startedAt = new Date().toISOString();
    const store = new JsonlEventStore(rootDir, runId, startedAt);

    await mkdir(dirname(store.runPath), { recursive: true });
    await writeFile(store.runPath, "", { flag: "a" });
    await writeFile(join(rootDir, "latest.json"), JSON.stringify(store.latestPointer(), null, 2), "utf8");
    return store;
  }

  append(event: SeatbeltEvent): Promise<void> {
    this.emit("event", event);
    this.queue = this.queue.then(async () => {
      try {
        await appendFile(this.runPath, `${JSON.stringify(event)}\n`, "utf8");
      } catch (error) {
        this.emit("write_error", {
          error: normalizeError(error),
          event,
          runPath: this.runPath
        } satisfies EventStoreWriteFailure);
      }
    });
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue;
  }

  async readEvents(runId = this.runId): Promise<SeatbeltEvent[]> {
    const path = join(this.rootDir, "runs", `${runId}.jsonl`);
    const content = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    });
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SeatbeltEvent);
  }

  async listRuns(): Promise<LatestRunPointer[]> {
    const runsDir = join(this.rootDir, "runs");
    const entries = await readdir(runsDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    });
    const pointers = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".jsonl"))
        .map(async (entry) => {
          const runPath = join(runsDir, entry);
          const info = await stat(runPath);
          return {
            runId: entry.replace(/\.jsonl$/, ""),
            path: runPath,
            startedAt: info.birthtime.toISOString()
          };
        })
    );
    return pointers.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async summarize(runId = this.runId): Promise<RunSummary> {
    const events = await this.readEvents(runId);
    return {
      runId,
      startedAt: events[0]?.timestamp ?? this.startedAt,
      eventCount: events.length,
      allowedCount: events.filter((event) => event.decision === "allowed").length,
      blockedCount: events.filter((event) => event.decision === "blocked").length,
      redactedCount: events.filter((event) => event.decision === "redacted").length,
      errorCount: events.filter((event) => event.decision === "error").length
    };
  }

  private latestPointer(): LatestRunPointer {
    return {
      runId: this.runId,
      path: this.runPath,
      startedAt: this.startedAt
    };
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function defaultSeatbeltRoot(): string {
  return join(homedir(), ".mcp-seatbelt");
}

export function createRunId(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
