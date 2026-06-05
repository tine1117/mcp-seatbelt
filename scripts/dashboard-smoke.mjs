import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const rootDir = resolve(".");
const tempDir = await mkdtemp(join(tmpdir(), "mcp-seatbelt-dashboard-smoke-"));
let serverProcess;
let browser;

try {
  const configPath = join(tempDir, "seatbelt.config.json");
  const runRoot = join(tempDir, "runs");
  await mkdir(runRoot, { recursive: true });
  await writeFile(configPath, JSON.stringify({
    mode: "strict",
    root: ".",
    allowlist: {
      paths: ["../shared-readonly"]
    }
  }, null, 2), "utf8");

  const url = await startDashboard(configPath, runRoot);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleProblems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });

  await verifyViewport(page, url, { width: 1365, height: 768 });
  await verifyViewport(page, url, { width: 390, height: 844 });

  if (consoleProblems.length > 0) {
    throw new Error(`Dashboard console warnings/errors:\n${consoleProblems.join("\n")}`);
  }

  console.log(`dashboard smoke passed: ${url}`);
} finally {
  if (browser) {
    await browser.close();
  }
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  await rm(tempDir, { recursive: true, force: true });
}

async function verifyViewport(page, url, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("text=Effective config");

  const metrics = await page.evaluate(() => ({
    innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    hasCopySchemaFix: document.body.textContent?.includes("Copy schema fix") ?? false,
    hasMissingSchema: document.body.textContent?.includes("missing") ?? false
  }));

  if (metrics.documentScrollWidth > metrics.innerWidth || metrics.bodyScrollWidth > metrics.innerWidth) {
    throw new Error(`Dashboard overflow at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.hasCopySchemaFix || !metrics.hasMissingSchema) {
    throw new Error(`Dashboard schema fix UI missing at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`);
  }
}

function startDashboard(configPath, runRoot) {
  return new Promise((resolveUrl, rejectUrl) => {
    const stderrChunks = [];
    const timeout = setTimeout(() => {
      rejectUrl(new Error(`Timed out waiting for dashboard URL:\n${stderrChunks.join("")}`));
    }, 10000);

    serverProcess = spawn(process.execPath, [
      "packages/seatbelt/dist/index.js",
      "wrap",
      "--dashboard",
      "--root-dir",
      runRoot,
      "--config",
      configPath,
      "--",
      process.execPath,
      "-e",
      "setInterval(()=>{},1000)"
    ], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    serverProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderrChunks.push(text);
      const match = text.match(/mcp-seatbelt dashboard: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolveUrl(match[1]);
      }
    });

    serverProcess.once("exit", (code) => {
      clearTimeout(timeout);
      rejectUrl(new Error(`Dashboard process exited early with code ${code}:\n${stderrChunks.join("")}`));
    });
    serverProcess.once("error", (error) => {
      clearTimeout(timeout);
      rejectUrl(error);
    });
  });
}
