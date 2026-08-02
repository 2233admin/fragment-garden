const TRACKING_QUERY_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);
const LOCAL_LINK_TITLE_MAX_CHARACTERS = 60;
const FALLBACK_LINK_TITLE = "链接碎片";
const LOCAL_HOSTNAME_SUFFIXES = [
  ".internal",
  ".home.arpa",
  ".lan",
  ".local",
  ".localdomain",
  ".localhost",
] as const;

export const EXTERNAL_URL_MAX_LENGTH = 2048;
export const EXTERNAL_URL_SOURCE_TEXT_MAX_LENGTH = 8192;

const EMBEDDED_EXTERNAL_URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’，。！？；：、【】《》「」『』]+/giu;
const TRAILING_SHARE_PUNCTUATION = /[.,!?;:，。！？；：、…]+$/u;
const TRAILING_BRACKET_PAIRS = new Map<string, string>([
  [")", "("],
  ["]", "["],
  ["}", "{"],
  ["）", "（"],
]);

function parseIpv4Address(hostname: string): readonly number[] | null {
  const parts = hostname.split(".");

  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) {
    return null;
  }

  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function isPrivateOrReservedIpv4(octets: readonly number[]): boolean {
  const [first = -1, second = -1, third = -1] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function parseIpv6Address(hostname: string): readonly number[] | null {
  let address = hostname.replace(/^\[|\]$/gu, "").toLowerCase();

  if (address.includes(".")) {
    const lastColonIndex = address.lastIndexOf(":");
    const ipv4Address = parseIpv4Address(address.slice(lastColonIndex + 1));

    if (lastColonIndex < 0 || ipv4Address === null) {
      return null;
    }

    const [first = 0, second = 0, third = 0, fourth = 0] = ipv4Address;
    address = `${address.slice(0, lastColonIndex)}:${((first << 8) | second).toString(16)}:${(
      (third << 8) |
      fourth
    ).toString(16)}`;
  }

  const compressedParts = address.split("::");
  if (compressedParts.length > 2) {
    return null;
  }

  const parseGroups = (value: string): readonly number[] | null => {
    if (value.length === 0) {
      return [];
    }

    const groups = value.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) {
      return null;
    }

    return groups.map((group) => Number.parseInt(group, 16));
  };

  const leftGroups = parseGroups(compressedParts[0] ?? "");
  const rightGroups = parseGroups(compressedParts[1] ?? "");

  if (leftGroups === null || rightGroups === null) {
    return null;
  }

  if (compressedParts.length === 1) {
    return leftGroups.length === 8 ? leftGroups : null;
  }

  const omittedGroupCount = 8 - leftGroups.length - rightGroups.length;
  if (omittedGroupCount < 1) {
    return null;
  }

  return [...leftGroups, ...Array<number>(omittedGroupCount).fill(0), ...rightGroups];
}

function isIpv4EmbeddingIpv6(groups: readonly number[]): boolean {
  const hasZeroPrefix = (length: number): boolean =>
    groups.slice(0, length).every((group) => group === 0);

  const isIpv4Compatible = hasZeroPrefix(6);
  const isIpv4Mapped = hasZeroPrefix(5) && groups[5] === 0xffff;
  const isIpv4Translated = hasZeroPrefix(4) && groups[4] === 0xffff && groups[5] === 0;
  const isNat64WellKnown =
    groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
  const isNat64LocalUse = groups[0] === 0x64 && groups[1] === 0xff9b && groups[2] === 1;
  const isSixToFour = groups[0] === 0x2002;
  const isTeredo = groups[0] === 0x2001 && groups[1] === 0;
  const isIsatap = (groups[4] === 0 || groups[4] === 0x200) && groups[5] === 0x5efe;

  return (
    isIpv4Compatible ||
    isIpv4Mapped ||
    isIpv4Translated ||
    isNat64WellKnown ||
    isNat64LocalUse ||
    isSixToFour ||
    isTeredo ||
    isIsatap
  );
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const groups = parseIpv6Address(hostname);

  if (groups === null) {
    return true;
  }

  return (
    groups.every((group) => group === 0) ||
    (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) ||
    (groups[0]! & 0xfe00) === 0xfc00 ||
    (groups[0]! & 0xffc0) === 0xfe80 ||
    (groups[0]! & 0xffc0) === 0xfec0 ||
    (groups[0]! & 0xff00) === 0xff00 ||
    (groups[0] === 0x2001 && groups[1] === 0xdb8) ||
    isIpv4EmbeddingIpv6(groups)
  );
}

function assertExternalHostnameIsSafe(hostname: string): void {
  const normalizedHostname = hostname.toLowerCase().replace(/\.+$/u, "");

  if (normalizedHostname.length === 0) {
    throw new Error("External URL must include a hostname");
  }

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname === "home.arpa" ||
    LOCAL_HOSTNAME_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix))
  ) {
    throw new Error("Local network URLs are not allowed");
  }

  const ipv4Address = parseIpv4Address(normalizedHostname);
  if (ipv4Address !== null) {
    if (isPrivateOrReservedIpv4(ipv4Address)) {
      throw new Error("Private or reserved network URLs are not allowed");
    }

    return;
  }

  if (normalizedHostname.includes(":")) {
    if (isPrivateOrReservedIpv6(normalizedHostname)) {
      throw new Error("Private or reserved network URLs are not allowed");
    }

    return;
  }

  if (!normalizedHostname.includes(".")) {
    throw new Error("Local network hostnames are not allowed");
  }
}

function countCharacter(value: string, character: string): number {
  return Array.from(value).filter((candidate) => candidate === character).length;
}

function trimTrailingSharePunctuation(value: string): string {
  let candidate = value.replace(TRAILING_SHARE_PUNCTUATION, "");

  while (candidate.length > 0) {
    const trailingCharacter = candidate.at(-1);
    const openingCharacter =
      trailingCharacter === undefined ? undefined : TRAILING_BRACKET_PAIRS.get(trailingCharacter);

    if (trailingCharacter === undefined || openingCharacter === undefined) {
      break;
    }

    if (
      countCharacter(candidate, trailingCharacter) <= countCharacter(candidate, openingCharacter)
    ) {
      break;
    }

    candidate = candidate.slice(0, -1).replace(TRAILING_SHARE_PUNCTUATION, "");
  }

  return candidate;
}

export function extractFirstExternalUrl(sourceText: string): string | null {
  if (sourceText.length === 0 || sourceText.length > EXTERNAL_URL_SOURCE_TEXT_MAX_LENGTH) {
    return null;
  }

  for (const match of sourceText.matchAll(EMBEDDED_EXTERNAL_URL_PATTERN)) {
    const candidate = trimTrailingSharePunctuation(match[0]);

    try {
      parseExternalUrl(candidate);
      return candidate;
    } catch {
      // Keep looking when a share message contains an unsafe or malformed candidate first.
    }
  }

  return null;
}

export function parseExternalUrl(sourceUrl: unknown): URL {
  if (typeof sourceUrl !== "string") {
    throw new Error("External URL must be a string");
  }

  const trimmedSourceUrl = sourceUrl.trim();

  if (trimmedSourceUrl.length === 0 || trimmedSourceUrl.length > EXTERNAL_URL_MAX_LENGTH) {
    throw new Error("External URL length is invalid");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedSourceUrl);
  } catch {
    throw new Error("External URL could not be parsed");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("External URL must use HTTP or HTTPS");
  }

  if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
    throw new Error("External URL credentials are not allowed");
  }

  assertExternalHostnameIsSafe(parsedUrl.hostname);
  return parsedUrl;
}

function truncateLinkTitle(value: string): string {
  const characters = Array.from(value);

  if (characters.length <= LOCAL_LINK_TITLE_MAX_CHARACTERS) {
    return value;
  }

  return `${characters.slice(0, LOCAL_LINK_TITLE_MAX_CHARACTERS - 1).join("")}…`;
}

export function normalizeExternalUrl(sourceUrl: string): string {
  const parsedUrl = parseExternalUrl(sourceUrl);

  parsedUrl.hash = "";

  for (const parameterName of [...parsedUrl.searchParams.keys()]) {
    if (TRACKING_QUERY_PARAMETERS.has(parameterName.toLowerCase())) {
      parsedUrl.searchParams.delete(parameterName);
    }
  }

  parsedUrl.searchParams.sort();

  const normalizedPathname =
    parsedUrl.pathname === "/" ? "" : parsedUrl.pathname.replace(/\/+$/u, "");
  const normalizedSearch =
    parsedUrl.searchParams.size === 0 ? "" : `?${parsedUrl.searchParams.toString()}`;

  return `${parsedUrl.protocol}//${parsedUrl.host.toLowerCase()}${normalizedPathname}${normalizedSearch}`;
}

export function deriveLocalLinkTitle(sourceUrl: string): string {
  try {
    const parsedUrl = parseExternalUrl(sourceUrl);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./u, "");

    return hostname.length === 0
      ? FALLBACK_LINK_TITLE
      : truncateLinkTitle(`来自 ${hostname} 的链接`);
  } catch {
    return FALLBACK_LINK_TITLE;
  }
}
