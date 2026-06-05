import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("package metadata", () => {
  it("points the published binary at the built CLI entrypoint", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

    expect(packageJson.bin["mcp-seatbelt"]).toBe("dist/index.js");
  });

  it("packages the user-facing docs, schema, and examples needed after install", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    const packageReadme = readFileSync(resolve("README.md"), "utf8");
    const packageSchema = readFileSync(resolve("docs", "seatbelt.config.schema.json"), "utf8");
    const rootSchema = readFileSync(resolve("..", "..", "docs", "seatbelt.config.schema.json"), "utf8");
    const packageExample = readFileSync(resolve("examples", "seatbelt.config.json"), "utf8");
    const rootExample = readFileSync(resolve("..", "..", "examples", "seatbelt.config.json"), "utf8");

    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "docs", "examples", "README.md", "LICENSE"]));
    expect(packageReadme).toContain("mcp-seatbelt wrap --dashboard");
    expect(packageReadme).toContain("mcp-seatbelt doctor --json --fail-on unprotected");
    expect(packageReadme).toContain("mcp-seatbelt config schema");
    expect(JSON.parse(packageSchema)).toEqual(JSON.parse(rootSchema));
    expect(JSON.parse(packageExample)).toEqual(JSON.parse(rootExample));
  });
});
