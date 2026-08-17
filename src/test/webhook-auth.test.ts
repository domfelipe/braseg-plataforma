import { describe, it, expect } from "vitest";
import {
  extractApiKeyCandidates,
  isAuthorizedApiKey,
} from "../../supabase/functions/_shared/webhook-auth";

const KEY = "secret-key-123";

const candidates = (h: Record<string, string>) =>
  extractApiKeyCandidates(Object.entries(h));

describe("extractApiKeyCandidates", () => {
  it("reads Authorization: Bearer", () => {
    expect(candidates({ Authorization: `Bearer ${KEY}` })).toEqual([KEY]);
    expect(candidates({ authorization: `bearer ${KEY}` })).toEqual([KEY]);
  });

  it("ignores non-bearer Authorization", () => {
    expect(candidates({ Authorization: `Basic ${KEY}` })).toEqual([]);
  });

  it("reads api-key style headers", () => {
    expect(candidates({ "x-api-key": KEY })).toEqual([KEY]);
    expect(candidates({ "X-Receipt-Api-Key": KEY })).toEqual([KEY]);
    expect(candidates({ apikey: KEY })).toEqual([KEY]);
    expect(candidates({ "My_API_KEY": KEY })).toEqual([KEY]);
  });

  it("ignores empty values and unrelated headers", () => {
    expect(candidates({ "x-api-key": "  ", "content-type": "multipart/form-data" })).toEqual([]);
  });
});

describe("isAuthorizedApiKey", () => {
  it("authorizes a matching header or multipart value", () => {
    expect(isAuthorizedApiKey(candidates({ "x-api-key": KEY }), KEY)).toBe(true);
    expect(isAuthorizedApiKey([KEY], KEY)).toBe(true);
    expect(isAuthorizedApiKey([` ${KEY} `], KEY)).toBe(true);
  });

  it("rejects missing, wrong or unset keys", () => {
    expect(isAuthorizedApiKey([], KEY)).toBe(false);
    expect(isAuthorizedApiKey([null, undefined], KEY)).toBe(false);
    expect(isAuthorizedApiKey(["wrong"], KEY)).toBe(false);
    expect(isAuthorizedApiKey([KEY], undefined)).toBe(false);
    expect(isAuthorizedApiKey([""], "")).toBe(false);
  });
});
