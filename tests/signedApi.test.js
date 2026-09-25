// @ts-check
import { describe, it, expect, vi, beforeEach } from "vitest";

const buildSignedFetch = vi.fn(() => async () => new Response("{}"));
const clientCtor = vi.fn();

vi.mock("../js/adapters/Cognito.js", () => ({
  CognitoAPIClient: class {
    constructor() {
      clientCtor();
    }
    buildSignedFetch() {
      return buildSignedFetch();
    }
  },
}));

import { getApiEndpoint, loadSignedFetch, resetSignedFetch } from "../js/adapters/SignedApi.js";
import { AWS_CONFIG } from "../js/adapters/awsConfig.js";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("SignedApi (lazy AWS SDK chunk)", () => {
  beforeEach(() => {
    resetSignedFetch();
    clientCtor.mockClear();
    buildSignedFetch.mockClear();
  });

  it("exposes the API endpoint without touching the SDK", () => {
    expect(getApiEndpoint()).toBe(AWS_CONFIG.apiEndpoint);
    expect(clientCtor).not.toHaveBeenCalled();
  });

  it("loads the signing client once and shares it across concurrent callers", async () => {
    const [a, b] = await Promise.all([loadSignedFetch(), loadSignedFetch()]);
    const c = await loadSignedFetch();
    expect(typeof a).toBe("function");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(clientCtor).toHaveBeenCalledTimes(1);
    expect(buildSignedFetch).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed load so a later call can retry", async () => {
    buildSignedFetch.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(loadSignedFetch()).rejects.toThrow("boom");
    const fetchLike = await loadSignedFetch();
    expect(typeof fetchLike).toBe("function");
    expect(clientCtor).toHaveBeenCalledTimes(2);
  });
});

describe("LeaderboardManager repository creation", () => {
  beforeEach(() => {
    resetSignedFetch();
    clientCtor.mockClear();
  });

  it("builds the endpoint from static config and skips the SDK in test environments", async () => {
    const repo = await LeaderboardManager._createRepository();
    expect(repo.endpoint).toBe(`${AWS_CONFIG.apiEndpoint}?id=${LeaderboardManager.REMOTE_ID}`);
    expect(clientCtor).not.toHaveBeenCalled();
  });
});
