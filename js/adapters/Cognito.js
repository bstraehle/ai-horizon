import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { SignatureV4MultiRegion } from "@aws-sdk/signature-v4-multi-region";
import { Sha256 } from "@aws-crypto/sha256-js";

/**
 * Lightweight AWS API Gateway client that uses Cognito Identity Pool credentials
 * and SigV4 signing to call a protected leaderboard endpoint.
 *
 * Notes:
 * - This module is ESM and runs in browser or Node 18+ where global fetch exists.
 * - Keep Node-specific types out to satisfy checkJs in tsconfig.
 */
class CognitoAPIClient {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.identityPoolId]
   * @param {string} [opts.region]
   * @param {string} [opts.apiEndpoint] Base endpoint (no query). Example: https://.../dev/leaderboard
   * @param {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>} [opts.fetchImpl]
   */
  constructor(opts) {
    /** @private */ this.identityPoolId =
      opts?.identityPoolId ?? "us-west-2:3039071f-2d61-42c8-a869-af7594fa2c7d";
    /** @private */ this.region = opts?.region ?? "us-west-2";
    /** @private */ this.apiEndpoint =
      opts?.apiEndpoint ?? "https://0p6x6bw6c2.execute-api.us-west-2.amazonaws.com/dev/leaderboard";
    // Bind fetch to the global object to avoid "Illegal invocation" when called indirectly
    /** @private */ this._fetch =
      opts?.fetchImpl ??
      (typeof fetch !== "undefined"
        ? fetch.bind(globalThis)
        : /** @type {any} */ (
            async () => {
              throw new Error("fetch is not available in this environment");
            }
          ));

    // Initialize credentials
    /** @private */ this.credentials = fromCognitoIdentityPool({
      identityPoolId: this.identityPoolId,
      clientConfig: { region: this.region },
    });

    // Initialize signer for API Gateway requests
    /** @private */ this.signer = new SignatureV4MultiRegion({
      service: "execute-api",
      region: this.region,
      credentials: this.credentials,
      sha256: Sha256,
    });
  }

  /**
   * Public: return the configured base API endpoint (no query params).
   * @returns {string}
   */
  getApiEndpoint() {
    return this.apiEndpoint;
  }

  /**
   * Public: build a fetch implementation that signs requests with SigV4.
   * Supports GET and PUT JSON used by our RemoteAdapter.
   * @returns {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>}
   */
  buildSignedFetch() {
    return async (input, init = {}) => {
      const urlStr = typeof input === "string" ? input : input.toString();
      const url = new URL(urlStr);
      const method = (init.method || "GET").toUpperCase();

      // Optimization: Avoid SigV4 for simple GET requests to prevent CORS preflight due to
      // Authorization/x-amz-* headers. Many public API Gateway GETs do not require auth.
      // Writes (PUT) remain signed.
      if (method === "GET") {
        return this._fetch(url.toString(), init);
      }

      try {
        const signed = await this._buildSignedHeaders(url, method);
        // Do not set 'host' explicitly in browser; the UA sets it. Keep it for signing but omit on send.
        const { host, Host, ...restSigned } = signed.headers || {};
        const mergedHeaders = { ...(init.headers || {}), ...restSigned };
        return await this._fetch(url.toString(), { ...init, headers: mergedHeaders });
      } catch (err) {
        console.error("[Cognito] signed fetch error:", method, url.toString(), err);
        throw err;
      }
    };
  }

  /**
   * @private Build SigV4-signed headers for a given URL/method.
   * @param {URL} url
   * @param {string} method
   */
  _buildSignedHeaders(url, method) {
    // Build request in the shape expected by SigV4 signer
    /** @type {{ method: string; protocol: string; hostname: string; path: string; query: Record<string, string | string[]>; headers: Record<string,string>; }} */
    const requestToSign = {
      method: method,
      protocol: url.protocol, // e.g., 'https:'
      hostname: url.hostname,
      path: url.pathname,
      query: {},
      headers: {
        host: url.host,
      },
    };

    // Collect query params
    for (const [k, v] of url.searchParams.entries()) {
      if (requestToSign.query[k] === undefined) {
        requestToSign.query[k] = v;
      } else if (Array.isArray(requestToSign.query[k])) {
        /** @type {string[]} */ (requestToSign.query[k]).push(v);
      } else {
        requestToSign.query[k] = [/** @type {string} */ (requestToSign.query[k]), v];
      }
    }

    if (method !== "GET" && !requestToSign.headers["content-type"]) {
      requestToSign.headers["content-type"] = "application/json";
    }
    return this.signer.sign(requestToSign);
  }

  /**
   * Call the leaderboard API (IAM-auth, SigV4 signed)
   * @param {number|string} id
   * @returns {Promise<any>} Parsed JSON response
   */
  async callLeaderboardAPI(id) {
    // Build URL with query
    const url = new URL(this.apiEndpoint);
    if (id !== undefined && id !== null) url.searchParams.set("id", String(id));

    // For GET requests, do not sign to avoid CORS preflight (no x-amz-* headers)
    const res = await this._fetch(url.toString(), { method: "GET" });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "<unavailable>");
      throw new Error(`API call failed: ${res.status} ${res.statusText} — ${bodyText}`);
    }
    return res.json();
  }

  /**
   * Switch from anonymous to authenticated Cognito identity.
   * Call this after obtaining an IdP token to elevate permissions.
   * @param {string} loginToken
   * @param {string} provider
   * @returns {Promise<void>}
   */
  async authenticateUser(loginToken, provider) {
    // Update credentials with login information
    this.credentials = fromCognitoIdentityPool({
      identityPoolId: this.identityPoolId,
      clientConfig: { region: this.region },
      logins: { [provider]: loginToken },
    });

    // Update signer with new credentials
    this.signer = new SignatureV4MultiRegion({
      service: "execute-api",
      region: this.region,
      credentials: this.credentials,
      sha256: Sha256,
    });
  }
}

// Usage example
async function main() {
  const apiClient = new CognitoAPIClient();
  try {
    const leaderboardData = await apiClient.callLeaderboardAPI(1);
    console.log("Leaderboard data:", leaderboardData);
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
  }
}

// Export for programmatic usage
export { CognitoAPIClient, main };
