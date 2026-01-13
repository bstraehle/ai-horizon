/* AI Horizon Service Worker
 * Provides offline-first caching for core assets and a network-first strategy for API calls.
 * Increment CACHE_VERSION to force an update after deploys that change cached assets.
 */
const CACHE_VERSION = "v1.0.402";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Core assets required for the app shell / offline play
// Base list of core assets (bundle injected dynamically once detected).
const PRECACHE_CORE = [
  "/",
  "/index.html",
  "/about.html",
  "/style.css",
  "/favicon.png",
  "/manifest.webmanifest",
  "/pwa-register.js",
];

/**
 * Detect which bundle path exists (dev vs prod) without logging expected 404 noise.
 *
 * Probes candidate bundle locations using HEAD requests to avoid 404 console errors.
 * Returns the first path that responds with a 2xx status.
 *
 * @returns {Promise<string|null>} The detected bundle path, or null if none found.
 * @private
 */
async function detectBundlePath() {
  const candidates = ["/dist/bundle.js", "/bundle.js"];
  for (const c of candidates) {
    try {
      const resp = await fetch(c, { method: "HEAD", cache: "no-cache" });
      if (resp.ok) return c; // Use the first that responds 2xx
    } catch (_) {
      // Ignore network errors here; we'll try next candidate.
    }
  }
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const finalList = [...PRECACHE_CORE];
      const bundlePath = await detectBundlePath();
      if (bundlePath) finalList.push(bundlePath);

      for (const url of finalList) {
        try {
          const response = await fetch(url, { cache: "no-cache" });
          if (response.ok) {
            await cache.put(url, response.clone());
          } else {
            console.warn("[SW] Skip precache (status)", url, response.status);
          }
        } catch (err) {
          console.warn("[SW] Skip precache (error)", url, err);
        }
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("static-") || key.startsWith("runtime-"))
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Stale-while-revalidate caching strategy for static assets.
 *
 * Returns cached response immediately (if available) while updating the cache
 * in the background. Provides instant load times for returning visitors while
 * ensuring assets stay fresh.
 *
 * Behavior:
 *  - If cached: returns cached response immediately, fetches fresh in background.
 *  - If not cached: fetches from network and caches the response.
 *  - Broadcasts 'asset-updated' message to all clients when cache is refreshed.
 *
 * @param {Request} request The fetch request to handle.
 * @returns {Promise<Response>} The cached or fresh response.
 * @private
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });

  // Background update
  (async () => {
    try {
      const fresh = await fetch(request, { cache: "no-cache" });
      if (fresh && fresh.ok) {
        await cache.put(request, fresh.clone());
        // Notify any open clients that a resource has been updated (lightweight broadcast)
        try {
          const clientsList = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          for (const client of clientsList) {
            client.postMessage({ type: "asset-updated", url: request.url });
          }
        } catch (_) {
          // Ignore broadcast errors
        }
      }
    } catch (_) {
      // Likely offline / timeout; keep existing cached version
    }
  })();

  if (cached) {
    // Don't block on update
    return cached;
  }

  // No cached version yet: fetch normally (still with no-cache to ensure origin validation)
  try {
    const fresh = await fetch(request, { cache: "no-cache" });
    if (fresh && fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Fetch with timeout to avoid long hangs on flaky/offline mobile networks.
 *
 * Wraps fetch with an AbortController that cancels the request after the
 * specified timeout. Essential for mobile PWA reliability where network
 * conditions can be unpredictable.
 *
 * @param {Request} request The fetch request to execute.
 * @param {{ timeoutMs?: number }} [options] Options object.
 * @param {number} [options.timeoutMs=900] Timeout in milliseconds before aborting.
 * @returns {Promise<Response>} The fetch response or rejection on timeout.
 * @private
 */
function fetchWithTimeout(request, { timeoutMs = 900 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Cache-first strategy with background update for navigation requests.
 *
 * Provides fast offline page loads by serving cached HTML immediately while
 * updating the cache in the background. Falls back to app shell (/index.html)
 * if both cache and network are unavailable.
 *
 * Behavior:
 *  - If cached: returns cached response, triggers background update via event.waitUntil.
 *  - If not cached: attempts network fetch with timeout, caches successful response.
 *  - On failure: falls back to cached /index.html or returns 503 Offline response.
 *
 * @param {Request} request The navigation request to handle.
 * @param {FetchEvent} [event] The fetch event for background update scheduling.
 * @returns {Promise<Response>} The cached, fresh, or fallback response.
 * @private
 */
async function navigationCacheFirst(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    // Update in the background when possible, but don't block the response
    if (event) {
      event.waitUntil(
        (async () => {
          try {
            const fresh = await fetchWithTimeout(request);
            if (fresh && fresh.ok) {
              await cache.put(request, fresh.clone());
            }
          } catch (_) {
            // likely offline/timeout; keep cached version
          }
        })()
      );
    }
    return cached;
  }

  // No cached version yet: try a quick network fetch, then fall back to app shell
  try {
    const fresh = await fetchWithTimeout(request);
    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_) {
    return (await cache.match("/index.html")) || new Response("Offline", { status: 503 });
  }
}

/**
 * Network-first caching strategy for API requests with graceful offline fallback.
 *
 * Prioritizes fresh data from the network while caching successful GET responses
 * for offline use. Returns cached response when offline, or a structured offline
 * error response for API Gateway endpoints.
 *
 * Behavior:
 *  - Attempts network fetch first.
 *  - Caches successful GET responses in RUNTIME_CACHE.
 *  - On network failure: returns cached response if available.
 *  - For execute-api endpoints: returns JSON offline message with 503 status.
 *
 * @param {Request} request The API request to handle.
 * @returns {Promise<Response>} The fresh, cached, or offline error response.
 * @private
 */
async function networkFirstAPI(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request.clone());
    if (request.method === "GET" && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (/execute-api/.test(request.url)) {
      return new Response(
        JSON.stringify({ offline: true, message: "Offline mode: leaderboard unavailable." }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Intercept HTML document requests that are NOT navigations (e.g., <link rel="prefetch" as="document">)
  // to provide a cache-first strategy and avoid noisy errors when offline.
  if (
    isSameOrigin &&
    request.method === "GET" &&
    request.mode !== "navigate" &&
    (url.pathname.endsWith(".html") || request.destination === "document")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const fresh = await fetchWithTimeout(request);
          if (fresh && fresh.ok) {
            await cache.put(request, fresh.clone());
          }
          return fresh;
        } catch (_) {
          // Silent no-op response prevents console errors on prefetch when offline
          return new Response("", { status: 204 });
        }
      })()
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationCacheFirst(request, event));
    return;
  }

  if (/execute-api/.test(url.hostname)) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  if (isSameOrigin) {
    if (/\.(?:js|css|png|webmanifest)$/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(request));
      return;
    }
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === "refreshAssets") {
    // Proactively re-fetch core assets & detected bundle
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(STATIC_CACHE);
          const bundlePath = await detectBundlePath();
          const targets = [...PRECACHE_CORE, ...(bundlePath ? [bundlePath] : [])];
          await Promise.all(
            targets.map(async (url) => {
              try {
                const fresh = await fetch(url + "?v=" + Date.now(), { cache: "no-cache" });
                if (fresh && fresh.ok) {
                  await cache.put(url, fresh.clone());
                }
              } catch (_) {
                // Ignore failures (offline or network error)
              }
            })
          );
        } catch (_) {
          // swallow
        }
      })()
    );
  }
});
