import { describe, expect, it } from "vitest";
import { SCHEMA_FIX_SNIPPET, shouldShowSchemaFix } from "../src/components/ConfigPanel";

describe("config panel schema fix logic", () => {
  it("shows the schema fix action only for missing or mismatched schema declarations", () => {
    expect(shouldShowSchemaFix("missing")).toBe(true);
    expect(shouldShowSchemaFix("mismatched")).toBe(true);
    expect(shouldShowSchemaFix("matched")).toBe(false);
    expect(shouldShowSchemaFix("unknown")).toBe(false);
    expect(shouldShowSchemaFix(undefined)).toBe(false);
  });

  it("copies the minimal schema fix snippet", () => {
    expect(SCHEMA_FIX_SNIPPET).toBe('  "$schema": "../docs/seatbelt.config.schema.json",');
  });
});
