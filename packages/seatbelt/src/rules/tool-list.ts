import { createHash } from "node:crypto";

export interface CanonicalToolDescriptor {
  name: unknown;
  description: unknown;
  inputSchema: unknown;
}

export function hashToolList(tools: unknown[]): string {
  return createHash("sha256").update(stableStringify(canonicalizeToolList(tools))).digest("hex");
}

function canonicalizeToolList(tools: unknown[]): CanonicalToolDescriptor[] {
  return tools
    .map((tool) => {
      const record = getRecord(tool);
      return {
        name: record?.name,
        description: record?.description,
        inputSchema: record?.inputSchema
      };
    })
    .sort((left, right) => compareToolDescriptors(left, right));
}

function compareToolDescriptors(left: CanonicalToolDescriptor, right: CanonicalToolDescriptor): number {
  const leftName = typeof left.name === "string" ? left.name : stableStringify(left.name);
  const rightName = typeof right.name === "string" ? right.name : stableStringify(right.name);
  const nameComparison = leftName.localeCompare(rightName);
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return stableStringify(left).localeCompare(stableStringify(right));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = getRecord(value);
  if (record) {
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
