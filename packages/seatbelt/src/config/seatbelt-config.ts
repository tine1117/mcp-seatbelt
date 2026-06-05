import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { SeatbeltMode, SeatbeltOptions } from "../types/options.js";

export type SeatbeltConfigStatus = "missing" | "loaded" | "invalid-json" | "invalid-shape";
export type SeatbeltOptionSource = "cli" | "config" | "default";

export interface SeatbeltConfigLoadOptions {
  cwd: string;
  configPath?: string;
  explicit?: boolean;
}

export interface LoadedSeatbeltConfig {
  path: string;
  cwd: string;
  baseDir: string;
  explicit: boolean;
  status: SeatbeltConfigStatus;
  values?: {
    mode?: SeatbeltMode;
    root?: string;
    allowlistPaths?: string[];
  };
  schemaDeclaration?: string;
  error?: string;
}

export interface ResolvedSeatbeltOptions extends SeatbeltOptions {
  sources: {
    mode: SeatbeltOptionSource;
    root: SeatbeltOptionSource;
    allowlist: Exclude<SeatbeltOptionSource, "cli">;
  };
}

export interface SeatbeltOptionOverrides {
  mode?: SeatbeltMode;
  root?: string;
}

export function loadSeatbeltConfig(options: SeatbeltConfigLoadOptions): LoadedSeatbeltConfig {
  const configPath = resolve(options.cwd, options.configPath ?? "seatbelt.config.json");
  const baseDir = dirname(configPath);
  const explicit = options.explicit ?? Boolean(options.configPath);

  if (!existsSync(configPath)) {
    return {
      path: configPath,
      cwd: options.cwd,
      baseDir,
      explicit,
      status: "missing"
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    const validation = validateSeatbeltConfig(parsed);
    if (!validation.valid) {
      return {
        path: configPath,
        cwd: options.cwd,
        baseDir,
        explicit,
        status: "invalid-shape",
        error: validation.error
      };
    }

    const parsedRecord = parsed as Record<string, unknown>;
    return {
      path: configPath,
      cwd: options.cwd,
      baseDir,
      explicit,
      status: "loaded",
      values: validation.values,
      schemaDeclaration: typeof parsedRecord.$schema === "string" ? parsedRecord.$schema : undefined
    };
  } catch (error) {
    return {
      path: configPath,
      cwd: options.cwd,
      baseDir,
      explicit,
      status: "invalid-json",
      error: error instanceof Error ? error.message : "unknown parse error"
    };
  }
}

export function resolveSeatbeltOptions(config: LoadedSeatbeltConfig, overrides: SeatbeltOptionOverrides = {}): ResolvedSeatbeltOptions {
  const configValues = config.status === "loaded" ? config.values : undefined;
  const mode = overrides.mode ?? configValues?.mode ?? "protect";
  const rootSource: SeatbeltOptionSource = overrides.root ? "cli" : configValues?.root ? "config" : "default";
  const rootValue = overrides.root ?? configValues?.root ?? config.cwd;
  const root = resolveFromBase(rootValue, rootSource === "config" ? config.baseDir : config.cwd);
  const allowlistPaths = (configValues?.allowlistPaths ?? []).map((path) => resolveFromBase(path, config.baseDir));

  return {
    mode,
    root,
    allowlistPaths,
    sources: {
      mode: overrides.mode ? "cli" : configValues?.mode ? "config" : "default",
      root: rootSource,
      allowlist: configValues?.allowlistPaths ? "config" : "default"
    }
  };
}

function validateSeatbeltConfig(value: unknown): { valid: true; values: NonNullable<LoadedSeatbeltConfig["values"]> } | { valid: false; error: string } {
  if (!isRecord(value)) {
    return { valid: false, error: "config root must be a JSON object" };
  }

  const values: NonNullable<LoadedSeatbeltConfig["values"]> = {};
  if (value.mode !== undefined) {
    if (!isSeatbeltMode(value.mode)) {
      return { valid: false, error: "mode must be observe, protect, or strict" };
    }
    values.mode = value.mode;
  }

  if (value.root !== undefined) {
    if (typeof value.root !== "string") {
      return { valid: false, error: "root must be a string" };
    }
    values.root = value.root;
  }

  if (value.allowlist !== undefined) {
    if (!isRecord(value.allowlist)) {
      return { valid: false, error: "allowlist must be an object" };
    }
    const paths = value.allowlist.paths;
    if (paths !== undefined) {
      if (!Array.isArray(paths) || !paths.every((item) => typeof item === "string")) {
        return { valid: false, error: "allowlist.paths must be an array of strings" };
      }
      values.allowlistPaths = paths;
    }
  }

  return { valid: true, values };
}

function resolveFromBase(path: string, baseDir: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(baseDir, path);
}

function isSeatbeltMode(value: unknown): value is SeatbeltMode {
  return value === "observe" || value === "protect" || value === "strict";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
