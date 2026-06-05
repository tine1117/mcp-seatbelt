import { isAbsolute, relative, resolve } from "node:path";
import { extractUrlHosts, normalizeHost, type NormalizedCandidate, type ParsedCommand } from "./normalization.js";

export function detectSensitivePath(candidate: NormalizedCandidate): string | undefined {
  if (candidate.url) {
    return undefined;
  }

  const segments = candidate.pathSegments;
  if (
    segments.some((segment) => segment === ".ssh" || segment === ".aws" || segment === ".npmrc") ||
    segments.some((segment) => segment === "id_rsa" || segment === "id_ed25519") ||
    segments.includes(".config") && segments.includes("gh") ||
    segments.some((segment) => segment === ".env" || segment.startsWith(".env."))
  ) {
    return `sensitive local path matched: ${candidate.original}`;
  }

  if (segments.some((segment) => isPrivateKeyFilename(segment))) {
    return `private key path matched: ${candidate.original}`;
  }

  return undefined;
}

export function detectDestructiveShell(candidate: NormalizedCandidate): string | undefined {
  const command = candidate.command;
  if (isDocumentationCommand(command)) {
    return undefined;
  }

  if (hasDestructiveRm(command.tokens)) {
    return `destructive shell command matched: ${candidate.original}`;
  }

  const patterns = [
    /\brm\s+-[a-z]*r[a-z]*f?\s+[^\n\r]*/i,
    /\bdel\b(?=[^\n\r]*\/s\b)[^\n\r]*/i,
    /\bdel\b(?=[^\n\r]*\/q\b)[^\n\r]*/i,
    /\brmdir\s+\/s\b/i,
    /\bremove-item\b(?=[^\n\r]*(?:-recurse|-r)\b)(?=[^\n\r]*(?:-force|-f)\b)[^\n\r]*/i,
    /\bmkfs(?:\.[a-z0-9]+)?\b/i,
    /\bformat\s+[a-z]:/i,
    /\bcurl\b[^\n\r|]*\|\s*(?:sh|bash|zsh)\b/i,
    /\b(?:invoke-webrequest|invoke-restmethod|iwr|irm)\b[^\n\r|]*\|\s*(?:iex|invoke-expression)\b/i,
    /\bchmod\s+777\b/i
  ];

  return patterns.some((pattern) => pattern.test(command.normalized))
    ? `destructive shell command matched: ${candidate.original}`
    : undefined;
}

export function detectPathTraversal(candidate: NormalizedCandidate, root: string, allowlistPaths: string[]): string | undefined {
  if (!looksLikePath(candidate.original) && !looksLikePath(candidate.decoded)) {
    return undefined;
  }

  const rootResolved = resolve(root);
  const candidatePath = isAbsolute(candidate.pathText) ? resolve(candidate.pathText) : resolve(rootResolved, candidate.pathText);
  const trustedRoots = [rootResolved, ...allowlistPaths.map((path) => resolve(path))];
  if (trustedRoots.some((trustedRoot) => isPathWithin(candidatePath, trustedRoot))) {
    return undefined;
  }

  if (/(^|[\\/])\.\.([\\/]|$)/.test(candidate.pathText)) {
    return `path traversal segment matched: ${candidate.original}`;
  }

  if (!isPathWithin(candidatePath, rootResolved)) {
    return `path resolves outside configured root: ${candidate.original}`;
  }

  return undefined;
}

export function detectMetadataEndpoint(candidate: NormalizedCandidate): boolean {
  const hosts = [
    candidate.url,
    ...extractUrlHosts(candidate.decoded),
    ...extractHostLikeTokens(candidate.decoded)
  ].filter((host): host is { normalizedHost: string } => Boolean(host));
  return hosts.some((host) => isMetadataHost(host.normalizedHost));
}

function isPrivateKeyFilename(segment: string): boolean {
  if (!/private[-_ ]?key/.test(segment)) {
    return false;
  }

  return !/\.(?:md|markdown|txt|rst|adoc|html?)$/.test(segment);
}

function isDocumentationCommand(command: ParsedCommand): boolean {
  return (
    (command.executable === "echo" || command.executable === "printf") &&
    !command.hasUnquotedShellSeparator &&
    !command.normalized.includes("$(") &&
    !command.normalized.includes("`")
  );
}

function hasDestructiveRm(tokens: string[]): boolean {
  const rmIndex = tokens.findIndex((token) => token.toLowerCase() === "rm");
  if (rmIndex === -1) {
    return false;
  }

  const flagText = tokens
    .slice(rmIndex + 1)
    .filter((token) => token.startsWith("-"))
    .join("");
  return flagText.includes("r") && flagText.includes("f");
}

function looksLikePath(value: string): boolean {
  return (
    value.includes("/") ||
    value.includes("\\") ||
    /^[a-zA-Z]:/.test(value) ||
    value.startsWith(".")
  ) && !/^https?:\/\//i.test(value);
}

function isPathWithin(candidate: string, root: string): boolean {
  const relationship = relative(root, candidate);
  return relationship === "" || Boolean(relationship) && !relationship.startsWith("..") && !isAbsolute(relationship);
}

function extractHostLikeTokens(value: string): Array<{ normalizedHost: string }> {
  return value
    .split(/[^\w.:%[\]-]+/)
    .map((token) => token.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
    .filter(Boolean)
    .map((token) => ({ normalizedHost: normalizeHost(token) }));
}

function isMetadataHost(host: string): boolean {
  return (
    host === "169.254.169.254" ||
    host === "::ffff:169.254.169.254" ||
    host === "::ffff:a9fe:a9fe" ||
    host === "fd00:ec2::254" ||
    host === "metadata.google.internal"
  );
}
