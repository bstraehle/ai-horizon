import { AWS_CONFIG } from "./awsConfig.js";

/** @typedef {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>} FetchLike */

/** @type {Promise<FetchLike> | null} */
let signedFetchPromise = null;

/**
 * SignedApi – lazy gateway to the SigV4-signing fetch built on the AWS SDK.
 *
 * The Cognito credential provider, SigV4 signer and their `@smithy` dependencies are over half of
 * the game bundle. They are only needed once a remote leaderboard / analysis request is actually
 * made, so `./Cognito.js` is loaded through a dynamic `import()` and the bundler emits it as a
 * separate chunk. The initial script the browser must download, parse and compile therefore
 * contains only game code; the SDK chunk is fetched in the background the first time it is needed
 * (typically the leaderboard load after startup, which was already asynchronous).
 *
 * `loadSignedFetch` memoizes the in-flight/completed promise so concurrent callers share one load
 * and one client; a failed load is forgotten so a later call can retry.
 */

/**
 * Base API endpoint (no query string); available without loading the SDK.
 * @returns {string}
 */
export function getApiEndpoint() {
  return AWS_CONFIG.apiEndpoint;
}

/**
 * Resolve a fetch implementation that signs requests with Cognito identity credentials.
 * Loads the AWS SDK chunk on first use.
 * @returns {Promise<FetchLike>}
 */
export function loadSignedFetch() {
  if (!signedFetchPromise) {
    signedFetchPromise = import("./Cognito.js")
      .then(({ CognitoAPIClient }) => new CognitoAPIClient().buildSignedFetch())
      .catch((err) => {
        signedFetchPromise = null;
        throw err;
      });
  }
  return signedFetchPromise;
}

/**
 * Drop the memoized client (tests / re-authentication flows).
 */
export function resetSignedFetch() {
  signedFetchPromise = null;
}
