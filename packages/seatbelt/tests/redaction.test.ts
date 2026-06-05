import { describe, expect, it } from "vitest";
import { redactValue } from "../src/redaction/redact.js";

const FAKE_OPENAI_KEY = ["sk", "proj", "seatbeltredactionfixture000000"].join("-");
const FAKE_GITHUB_TOKEN = ["ghp", "seatbeltredactionfixture000000"].join("_");

describe("redaction", () => {
  it("redacts common API tokens inside nested JSON values", () => {
    const result = redactValue({
      text: `OpenAI key ${FAKE_OPENAI_KEY} and GitHub ${FAKE_GITHUB_TOKEN}`
    });

    expect(result.redacted).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain(FAKE_OPENAI_KEY);
    expect(JSON.stringify(result.value)).not.toContain(FAKE_GITHUB_TOKEN);
    expect(result.hits).toEqual(expect.arrayContaining(["openai", "github"]));
  });

  it("redacts private key blocks and bearer tokens", () => {
    const fakePrivateKeyBlock = [
      ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
      "abc",
      ["-----END", "PRIVATE KEY-----"].join(" ")
    ].join("\n");
    const input = [
      "Authorization: Bearer secret-token-value",
      fakePrivateKeyBlock
    ].join("\n");

    const result = redactValue(input);

    expect(result.value).toContain("[REDACTED:bearer]");
    expect(result.value).toContain("[REDACTED:private-key]");
    expect(result.redacted).toBe(true);
  });

  it("redacts token query parameters in URLs", () => {
    const result = redactValue("https://example.test/hook?token=abc123&safe=yes");

    expect(result.value).toBe("https://example.test/hook?token=[REDACTED:url-token]&safe=yes");
  });
});
