#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { JsonlEventStore } from "../logging/event-store.js";
import { StdioSeatbeltProxy } from "../proxy/stdio-proxy.js";
import type { SeatbeltMode } from "../types/options.js";
import { defaultCliIo, type CliIo, writeLine } from "./io.js";
import { createConfigExample, parseSupportedClient } from "../doctor/config-examples.js";
import { runDoctor, type DoctorFailCondition } from "../doctor/doctor.js";
import { runReplay } from "../replay/replay.js";
import { runDemo } from "../demo/demo.js";
import { startDashboardServer, type DashboardSeatbeltConfig } from "../dashboard-server/server.js";
import { RECOMMENDED_CONFIG_SCHEMA_REF, SEATBELT_CONFIG_SCHEMA } from "../config/seatbelt-config-schema.js";
import {
  loadSeatbeltConfig,
  resolveSeatbeltOptions,
  type LoadedSeatbeltConfig,
  type ResolvedSeatbeltOptions
} from "../config/seatbelt-config.js";

export async function runCli(argv = process.argv, io: CliIo = defaultCliIo()): Promise<number> {
  let exitCode = 0;
  const program = new Command();

  program
    .name("mcp-seatbelt")
    .description("Runtime guard and blackbox recorder for MCP tool calls.")
    .version("0.1.0")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => io.stdout.write(str),
      writeErr: (str) => io.stderr.write(str)
    });

  program
    .command("wrap")
    .description("Wrap a stdio MCP server command with mcp-seatbelt.")
    .option("--mode <mode>", "observe, protect, or strict")
    .option("--root <path>", "root path used for path traversal checks")
    .option("--config <path>", "seatbelt config file path")
    .option("--root-dir <path>", "mcp-seatbelt data directory")
    .option("--dashboard", "start the local dashboard server", false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[server...]", "server command after --")
    .action(async (server: string[], options: { mode?: string; root?: string; config?: string; rootDir?: string; dashboard?: boolean }) => {
      const loadedConfig = loadSeatbeltConfig({ cwd: io.cwd, configPath: options.config, explicit: Boolean(options.config) });
      ensureWrapConfigIsUsable(loadedConfig);
      const effectiveOptions = resolveSeatbeltOptions(loadedConfig, {
        mode: options.mode ? parseMode(options.mode) : undefined,
        root: options.root
      });
      if (server.length === 0) {
        throw new Error("Missing MCP server command. Use: mcp-seatbelt wrap -- <server command>");
      }
      const command = server[0];
      if (!command) {
        throw new Error("Missing MCP server command. Use: mcp-seatbelt wrap -- <server command>");
      }
      const args = server.slice(1);
      const store = await JsonlEventStore.create({ rootDir: options.rootDir });
      const dashboard = options.dashboard
        ? await startDashboardServer({
            store,
            staticDir: resolveDashboardStaticDir(io.cwd, io.env),
            config: createDashboardSeatbeltConfig(loadedConfig, effectiveOptions)
          })
        : undefined;
      if (options.dashboard) {
        writeLine(io.stderr, `mcp-seatbelt dashboard: ${dashboard?.url}`);
      }
      const proxy = new StdioSeatbeltProxy({
        command,
        args,
        mode: effectiveOptions.mode,
        root: effectiveOptions.root,
        allowlistPaths: effectiveOptions.allowlistPaths,
        store,
        stdin: io.stdin,
        stdout: io.stdout,
        stderr: io.stderr,
        env: io.env
      });
      await proxy.start();
      exitCode = await proxy.waitForExit();
      await dashboard?.close();
      await store.close();
    });

  program
    .command("demo")
    .description("Run built-in blocked, redacted, and allowed MCP safety scenarios.")
    .option("--root-dir <path>", "mcp-seatbelt data directory")
    .option("--dashboard", "print demo data for dashboard use", false)
    .action(async (options: { rootDir?: string; dashboard?: boolean }) => {
      exitCode = await runDemo({
        rootDir: options.rootDir,
        dashboard: options.dashboard,
        staticDir: resolveDashboardStaticDir(io.cwd, io.env)
      }, io);
    });

  program
    .command("replay")
    .description("Replay a JSONL run.")
    .argument("<target>", "`latest` or a JSONL file path")
    .option("--root-dir <path>", "mcp-seatbelt data directory")
    .action(async (target: string, options: { rootDir?: string }) => {
      exitCode = await runReplay({ target, rootDir: options.rootDir }, io);
    });

  program
    .command("doctor")
    .description("Inspect local MCP configuration files without modifying them.")
    .option("--json", "print machine-readable JSON", false)
    .option("--config <path>", "seatbelt config file path")
    .option("--fail-on <condition>", "return exit code 2 when condition is present: risk, invalid-config, or unprotected", collectFailOnCondition, [])
    .option("--fail-on-risk", "return exit code 2 when diagnosed MCP risks are found", false)
    .action(async (options: { json?: boolean; config?: string; failOn?: string[]; failOnRisk?: boolean }) => {
      exitCode = await runDoctor(io, {
        json: Boolean(options.json),
        configPath: options.config,
        failOn: parseFailConditions(options.failOn ?? [], Boolean(options.failOnRisk))
      });
    });

  const config = program.command("config").description("Print copyable config snippets.");
  config
    .command("example")
    .requiredOption("--client <client>", "claude-desktop, cursor, codex, or vscode")
    .action((options: { client: string }) => {
      const client = parseSupportedClient(options.client);
      writeLine(io.stdout, JSON.stringify(createConfigExample(client), null, 2));
    });
  config
    .command("schema")
    .description("Print the seatbelt.config.json JSON schema.")
    .action(() => {
      writeLine(io.stdout, JSON.stringify(SEATBELT_CONFIG_SCHEMA, null, 2));
    });

  try {
    await program.parseAsync(argv, { from: "node" });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeLine(io.stderr, `mcp-seatbelt: ${message}`);
    return 1;
  }
}

function parseMode(value: string): SeatbeltMode {
  if (value === "observe" || value === "protect" || value === "strict") {
    return value;
  }
  throw new Error(`Invalid mode: ${value}`);
}

function collectFailOnCondition(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseFailConditions(values: string[], failOnRisk: boolean): DoctorFailCondition[] {
  const conditions = failOnRisk ? ["risk", ...values] : values;
  return conditions.map((value) => {
    if (value === "risk" || value === "invalid-config" || value === "unprotected") {
      return value;
    }
    throw new Error(`Unsupported fail condition: ${value}`);
  });
}

function ensureWrapConfigIsUsable(config: LoadedSeatbeltConfig): void {
  if (config.status === "missing" && config.explicit) {
    throw new Error(`Seatbelt config not found: ${config.path}`);
  }
  if (config.status === "invalid-json" || config.status === "invalid-shape") {
    throw new Error(`Invalid seatbelt config: ${config.path}${config.error ? ` (${config.error})` : ""}`);
  }
}

function createDashboardSeatbeltConfig(
  config: LoadedSeatbeltConfig,
  effectiveOptions: ResolvedSeatbeltOptions
): DashboardSeatbeltConfig {
  return {
    path: config.path,
    status: config.status,
    effective: {
      mode: effectiveOptions.mode,
      root: effectiveOptions.root,
      allowlist: {
        paths: effectiveOptions.allowlistPaths
      }
    },
    sources: effectiveOptions.sources,
    error: config.error,
    schema: createDashboardSchemaInfo(config)
  };
}

function createDashboardSchemaInfo(config: LoadedSeatbeltConfig): DashboardSeatbeltConfig["schema"] {
  if (config.status !== "loaded") {
    return {
      expected: RECOMMENDED_CONFIG_SCHEMA_REF,
      status: "unknown"
    };
  }

  if (!config.schemaDeclaration) {
    return {
      expected: RECOMMENDED_CONFIG_SCHEMA_REF,
      status: "missing"
    };
  }

  return {
    expected: RECOMMENDED_CONFIG_SCHEMA_REF,
    declared: config.schemaDeclaration,
    status: config.schemaDeclaration === RECOMMENDED_CONFIG_SCHEMA_REF ? "matched" : "mismatched"
  };
}

function resolveDashboardStaticDir(cwd: string, env: NodeJS.ProcessEnv): string | undefined {
  const currentFile = fileURLToPath(import.meta.url);
  const candidates = [
    env.MCP_SEATBELT_DASHBOARD_DIR,
    resolve(cwd, "apps/dashboard/dist"),
    resolve(dirname(currentFile), "../dashboard"),
    resolve(dirname(currentFile), "../../apps/dashboard/dist")
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate));
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath && resolve(fileURLToPath(import.meta.url)) === entryPath) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}
