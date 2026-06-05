import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeatbeltConfig, resolveSeatbeltOptions } from "../src/config/seatbelt-config.js";

describe("seatbelt config", () => {
  it("returns defaults when the implicit config file is missing", () => {
    const cwd = resolve(tmpdir(), "seatbelt-config-missing");
    const config = loadSeatbeltConfig({ cwd });
    const effective = resolveSeatbeltOptions(config);

    expect(config.status).toBe("missing");
    expect(effective).toMatchObject({
      mode: "protect",
      root: cwd,
      allowlistPaths: [],
      sources: {
        mode: "default",
        root: "default",
        allowlist: "default"
      }
    });
  });

  it("resolves relative root and allowlist paths from the config file directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "seatbelt-config-"));
    const configPath = join(cwd, "nested", "seatbelt.config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({
      mode: "strict",
      root: "workspace",
      allowlist: {
        paths: ["../shared-readonly"]
      }
    }));

    const config = loadSeatbeltConfig({ cwd, configPath, explicit: true });
    const effective = resolveSeatbeltOptions(config);

    expect(config.status).toBe("loaded");
    expect(effective.mode).toBe("strict");
    expect(effective.root).toBe(resolve(cwd, "nested", "workspace"));
    expect(effective.allowlistPaths).toEqual([resolve(cwd, "shared-readonly")]);
    expect(effective.sources).toEqual({ mode: "config", root: "config", allowlist: "config" });
  });

  it("rejects invalid mode, root, and allowlist path shapes", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "seatbelt-config-invalid-"));
    const cases = [
      { file: "mode.json", contents: { mode: "paranoid" }, error: "mode" },
      { file: "root.json", contents: { root: 123 }, error: "root" },
      { file: "allowlist.json", contents: { allowlist: { paths: ["ok", 123] } }, error: "allowlist.paths" }
    ];

    for (const item of cases) {
      const configPath = join(cwd, item.file);
      await writeFile(configPath, JSON.stringify(item.contents));
      const config = loadSeatbeltConfig({ cwd, configPath, explicit: true });

      expect(config.status).toBe("invalid-shape");
      expect(config.error).toContain(item.error);
    }
  });

  it("documents seatbelt.config.json with a JSON schema and copyable example", () => {
    const schema = JSON.parse(readFileSync(resolve("../../docs/seatbelt.config.schema.json"), "utf8"));
    const example = JSON.parse(readFileSync(resolve("../../examples/seatbelt.config.json"), "utf8"));

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.mode.enum).toEqual(["observe", "protect", "strict"]);
    expect(schema.properties.mode.examples).toEqual(["protect"]);
    expect(schema.properties.root.markdownDescription).toContain("trusted project root");
    expect(schema.properties.allowlist.properties.paths.items.type).toBe("string");
    expect(schema.properties.allowlist.properties.paths.examples).toEqual([["../shared-readonly"]]);
    expect(example.$schema).toBe("../docs/seatbelt.config.schema.json");
    expect(example.mode).toBe("protect");
    expect(example.root).toBe(".");
    expect(example.allowlist.paths).toEqual(["../shared-readonly"]);
  });
});
