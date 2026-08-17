// Deterministic API key extraction for webhook endpoints.
// Never logs or returns the key value.

const normalizeHeaderName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Collects API key candidates from request headers:
 * - Authorization: Bearer <key>
 * - x-api-key / x-receipt-api-key / apikey
 * - any header whose normalized name contains "apikey"
 */
export function extractApiKeyCandidates(headers: Iterable<[string, string]>): string[] {
  const candidates: string[] = [];
  for (const [rawName, rawValue] of headers) {
    const name = normalizeHeaderName(rawName);
    const value = String(rawValue ?? "").trim();
    if (!value) continue;

    if (name === "authorization") {
      const match = value.match(/^Bearer\s+(.+)$/i);
      if (match) candidates.push(match[1].trim());
      continue;
    }
    if (name.includes("apikey")) candidates.push(value);
  }
  return candidates;
}

/** True when any candidate (header or multipart field) matches the expected secret. */
export function isAuthorizedApiKey(
  candidates: Array<string | null | undefined>,
  expectedKey: string | null | undefined,
): boolean {
  if (!expectedKey) return false;
  return candidates.some((c) => typeof c === "string" && c.trim() === expectedKey);
}
