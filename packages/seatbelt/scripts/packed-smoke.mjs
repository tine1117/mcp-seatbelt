import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(join(tmpdir(), "mcp-seatbelt-pack-smoke-"));

try {
  const distEntry = join(packageDir, "dist", "index.js");
  if (!existsSync(distEntry)) {
    throw new Error(`Build output not found: ${distEntry}. Run corepack pnpm build first.`);
  }

  const packDir = join(tempDir, "pack");
  const appDir = join(tempDir, "app");
  const homeDir = join(tempDir, "home");
  const appDataDir = join(tempDir, "appdata");
  const xdgConfigDir = join(tempDir, "xdg");
  await mkdir(packDir, { recursive: true });
  await mkdir(appDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(appDataDir, { recursive: true });
  await mkdir(xdgConfigDir, { recursive: true });

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const packResult = run(npmCommand, ["pack", "--json", "--pack-destination", packDir], { cwd: packageDir });
  const packEntries = parseJsonOutput(packResult, "npm pack --json");
  const tarballName = packEntries[0]?.filename;
  if (!tarballName) {
    throw new Error("npm pack did not report a tarball filename");
  }
  const tarballPath = join(packDir, tarballName);

  run(npmCommand, ["init", "-y"], { cwd: appDir });
  run(npmCommand, ["install", "--no-audit", "--no-fund", tarballPath], { cwd: appDir });

  const binPath = process.platform === "win32"
    ? join(appDir, "node_modules", ".bin", "mcp-seatbelt.cmd")
    : join(appDir, "node_modules", ".bin", "mcp-seatbelt");

  run(binPath, ["--help"], { cwd: appDir });
  const schemaResult = run(binPath, ["config", "schema"], { cwd: appDir });
  parseJsonOutput(schemaResult, "mcp-seatbelt config schema");

  const doctorResult = run(binPath, ["doctor", "--json"], {
    cwd: appDir,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      APPDATA: appDataDir,
      XDG_CONFIG_HOME: xdgConfigDir
    }
  });
  const report = parseJsonOutput(doctorResult, "mcp-seatbelt doctor --json");
  if (report.schemaVersion !== 1) {
    throw new Error("doctor --json did not return schemaVersion 1");
  }

  console.log(`packed package smoke passed: ${tarballName}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  if (result.error || result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(" ")}`,
      result.error?.message,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result;
}

function parseJsonOutput(result, label) {
  const stdout = result.stdout.trim();
  if (!stdout) {
    throw new Error([
      `${label} produced empty stdout`,
      result.stderr ? `stderr:\n${result.stderr}` : undefined
    ].filter(Boolean).join("\n"));
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error([
      `${label} produced invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      `stdout:\n${result.stdout}`,
      result.stderr ? `stderr:\n${result.stderr}` : undefined
    ].filter(Boolean).join("\n"));
  }
}
