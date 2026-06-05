export interface RedactionResult<T> {
  value: T;
  redacted: boolean;
  hits: string[];
}

interface RedactionPattern {
  id: string;
  pattern: RegExp;
  replacement: string;
}

const patterns: RedactionPattern[] = [
  {
    id: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED:private-key]"
  },
  {
    id: "openai",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/g,
    replacement: "[REDACTED:openai]"
  },
  {
    id: "anthropic",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/g,
    replacement: "[REDACTED:anthropic]"
  },
  {
    id: "github",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{24,}\b/g,
    replacement: "[REDACTED:github]"
  },
  {
    id: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: "[REDACTED:aws-access-key]"
  },
  {
    id: "supabase",
    pattern: /\bsb_[A-Za-z0-9_-]{24,}\b/g,
    replacement: "[REDACTED:supabase]"
  },
  {
    id: "vercel",
    pattern: /\bvercel_[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[REDACTED:vercel]"
  },
  {
    id: "bearer",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/g,
    replacement: "Bearer [REDACTED:bearer]"
  },
  {
    id: "env-value",
    pattern: /\b([A-Z][A-Z0-9_]{2,}(?:KEY|TOKEN|SECRET|PASSWORD))=([^\s"'`]+)/g,
    replacement: "$1=[REDACTED:env-value]"
  },
  {
    id: "url-token",
    pattern: /([?&](?:token|api_key|apikey|access_token|secret)=)([^&#\s]+)/gi,
    replacement: "$1[REDACTED:url-token]"
  }
];

export function redactValue<T>(value: T): RedactionResult<T> {
  const hits = new Set<string>();
  const redacted = redactUnknown(value, hits) as T;
  return {
    value: redacted,
    redacted: hits.size > 0,
    hits: [...hits]
  };
}

function redactUnknown(value: unknown, hits: Set<string>): unknown {
  if (typeof value === "string") {
    return redactString(value, hits);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, hits));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactUnknown(item, hits)]));
  }
  return value;
}

function redactString(value: string, hits: Set<string>): string {
  let current = value;
  for (const entry of patterns) {
    current = current.replace(entry.pattern, (match: string) => {
      hits.add(entry.id);
      return match.replace(entry.pattern, entry.replacement);
    });
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
