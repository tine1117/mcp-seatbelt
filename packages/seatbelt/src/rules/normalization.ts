export interface NormalizedUrlHost {
  original: string;
  decoded: string;
  hostname: string;
  normalizedHost: string;
}

export interface ParsedCommand {
  original: string;
  normalized: string;
  tokens: string[];
  executable?: string;
  hasUnquotedShellSeparator: boolean;
}

export interface NormalizedCandidate {
  original: string;
  decoded: string;
  lower: string;
  pathText: string;
  pathSegments: string[];
  url?: NormalizedUrlHost;
  command: ParsedCommand;
}

export function createNormalizedCandidate(value: string): NormalizedCandidate {
  const decoded = decodePercentEncoded(value) ?? value;
  const pathText = decoded.replace(/\\/g, "/");
  return {
    original: value,
    decoded,
    lower: decoded.toLowerCase(),
    pathText,
    pathSegments: pathText
      .toLowerCase()
      .split(/[?#]/)
      .flatMap((part) => part.split("/"))
      .filter(Boolean),
    url: parseUrlHost(decoded),
    command: parseCommand(decoded)
  };
}

export function decodePercentEncoded(value: string): string | undefined {
  if (!value.includes("%")) {
    return undefined;
  }

  let current = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) {
        break;
      }
      current = next;
    } catch {
      return undefined;
    }
  }

  return current === value ? undefined : current;
}

export function parseUrlHost(value: string): NormalizedUrlHost | undefined {
  if (!/^https?:\/\//i.test(value)) {
    return undefined;
  }

  const decoded = decodePercentEncoded(value) ?? value;
  const hostname = readUrlHostname(decoded);
  if (!hostname) {
    return undefined;
  }

  return {
    original: value,
    decoded,
    hostname,
    normalizedHost: normalizeHost(hostname)
  };
}

export function extractUrlHosts(value: string): NormalizedUrlHost[] {
  const urls = value.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return urls.map((url) => parseUrlHost(url)).filter((url): url is NormalizedUrlHost => Boolean(url));
}

export function normalizeHost(value: string): string {
  const host = (decodePercentEncoded(value) ?? value)
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
  return normalizeIpv4Host(host) ?? host;
}

function readUrlHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    const match = value.match(/^https?:\/\/([^/?#]+)/i);
    return match?.[1];
  }
}

function parseCommand(value: string): ParsedCommand {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let hasUnquotedShellSeparator = false;

  const flush = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!char) {
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      flush();
      continue;
    }

    if (char === ";" || char === "|") {
      hasUnquotedShellSeparator = true;
      flush();
      continue;
    }

    if ((char === "&" || char === "|") && value[index + 1] === char) {
      hasUnquotedShellSeparator = true;
      flush();
      index += 1;
      continue;
    }

    current += char;
  }

  flush();
  const executable = tokens[0]?.toLowerCase();
  return {
    original: value,
    normalized: value.trim().toLowerCase(),
    tokens,
    executable,
    hasUnquotedShellSeparator
  };
}

function normalizeIpv4Host(host: string): string | undefined {
  const parts = host.split(".");
  if (parts.length === 1) {
    const value = parseIpNumber(parts[0]);
    return value === undefined || value > 0xffffffff ? undefined : formatIpv4(value);
  }

  if (parts.length !== 4) {
    return undefined;
  }

  const octets = parts.map((part) => parseIpNumber(part));
  if (octets.some((part) => part === undefined || part > 255)) {
    return undefined;
  }
  return octets.join(".");
}

function parseIpNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  let parsed: number;
  if (/^0x[0-9a-f]+$/i.test(value)) {
    parsed = Number.parseInt(value.slice(2), 16);
  } else if (/^0[0-7]+$/.test(value) && value.length > 1) {
    parsed = Number.parseInt(value.slice(1), 8);
  } else if (/^\d+$/.test(value)) {
    parsed = Number.parseInt(value, 10);
  } else {
    return undefined;
  }

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatIpv4(value: number): string {
  return [
    Math.floor(value / 16777216) % 256,
    Math.floor(value / 65536) % 256,
    Math.floor(value / 256) % 256,
    value % 256
  ].join(".");
}
