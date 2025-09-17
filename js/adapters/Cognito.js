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
      try {
        const normalizedInitHeaders = this._normalizeHeaderObject(init.headers);
        const contentType = normalizedInitHeaders["content-type"];
        const bodyForSigning =
          method === "GET" || method === "HEAD" ? undefined : this._extractSigningBody(init.body);
        const signed = await this._buildSignedHeaders(url, method, bodyForSigning, contentType);
        const { host: _host, Host: _Host, ...restSigned } = signed.headers || {};
        const mergedHeaders = { ...normalizedInitHeaders };
        for (const [k, v] of Object.entries(restSigned)) {
          mergedHeaders[k.toLowerCase()] = v;
        }
        return await this._fetch(url.toString(), { ...init, headers: mergedHeaders });
      } catch (err) {
        console.error("[Cognito] signed fetch error:", method, url.toString(), err);
        throw err;
      }
    };
  }

  /**
   * @private
   * @param {URL} url
   * @param {string} method
   * @param {string|Uint8Array|undefined} body
   * @param {string|undefined} contentType
   */
  _buildSignedHeaders(url, method, body, contentType) {
    /** @type {{ method: string; protocol: string; hostname: string; path: string; query: Record<string, string | string[]>; headers: Record<string,string>; body?: string|Uint8Array }} */
    const requestToSign = {
      method: method,
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      query: {},
      headers: {
        host: url.host,
      },
    };
    for (const [k, v] of url.searchParams.entries()) {
      if (requestToSign.query[k] === undefined) {
        requestToSign.query[k] = v;
      } else if (Array.isArray(requestToSign.query[k])) {
        /** @type {string[]} */ (requestToSign.query[k]).push(v);
      } else {
        requestToSign.query[k] = [/** @type {string} */ (requestToSign.query[k]), v];
      }
    }
    if (contentType) requestToSign.headers["content-type"] = contentType;
    if (method !== "GET" && body !== undefined && body !== null) requestToSign.body = body;
    return this.signer.sign(requestToSign);
  }

  /**
   * @private Normalize body into a string/Uint8Array suitable for SigV4 canonicalization.
   * Currently we only expect JSON string bodies. If an object is passed, stringify it.
   * @param {any} body
   */
  _extractSigningBody(body) {
    if (body === null) return undefined;
    if (typeof body === "string" || body instanceof Uint8Array) return body;
    try {
      return JSON.stringify(body);
    } catch {
      return undefined;
    }
  }

  /**
   * @private Normalize an init.headers shape (object/Headers/array) into a plain object with lowercase keys.
   * @param {any} headers
   * @returns {Record<string,string>}
   */
  _normalizeHeaderObject(headers) {
    /** @type {Record<string,string>} */
    const out = {};
    if (!headers) return out;
    if (
      typeof headers === "object" &&
      !Array.isArray(headers) &&
      !(headers instanceof Array) &&
      !(typeof Headers !== "undefined" && headers instanceof Headers)
    ) {
      for (const [k, v] of Object.entries(headers)) {
        if (v === null) continue;
        out[k.toLowerCase()] = String(v);
      }
      return out;
    }
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      for (const [k, v] of headers.entries()) out[k.toLowerCase()] = v;
      return out;
    }
    if (Array.isArray(headers)) {
      for (const pair of headers) {
        if (!pair || pair.length < 2) continue;
        const [k, v] = pair;
        if (k && v !== null) out[String(k).toLowerCase()] = String(v);
      }
    }
    return out;
  }

  /**
   * Call the leaderboard API (IAM-auth, SigV4 signed)
   * @param {number|string} id
   * @returns {Promise<any>} Parsed JSON response
   */
  async callLeaderboardAPI(id) {
    const url = new URL(this.apiEndpoint);
    if (id !== undefined && id !== null) url.searchParams.set("id", String(id));
    const res = await this.buildSignedFetch()(url.toString(), { method: "GET" });
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
    this.credentials = fromCognitoIdentityPool({
      identityPoolId: this.identityPoolId,
      clientConfig: { region: this.region },
      logins: { [provider]: loginToken },
    });
    this.signer = new SignatureV4MultiRegion({
      service: "execute-api",
      region: this.region,
      credentials: this.credentials,
      sha256: Sha256,
    });
  }
}

async function main() {
  const apiClient = new CognitoAPIClient();
  try {
    const leaderboardData = await apiClient.callLeaderboardAPI(1);
    console.log("Leaderboard data:", leaderboardData);
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
  }
}

export { CognitoAPIClient, main };
