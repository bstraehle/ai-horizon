// Service Worker registration isolated in external file to comply with strict CSP (no inline scripts allowed)
// Handles Trusted Types enforcement (CSP: require-trusted-types-for 'script').
(() => {
  if (!("serviceWorker" in navigator)) return;

  // Create (or reuse) a Trusted Types policy for SW script URLs if Trusted Types are enforced.
  let swUrl = "/sw.js";
  try {
    if (window.trustedTypes?.createPolicy) {
      const policyName = "ai-horizon-sw";
      let policy = window.trustedTypes.getPolicy?.(policyName);
      if (!policy) {
        policy = window.trustedTypes.createPolicy(policyName, {
          createScriptURL: (url) => url,
        });
      }
      swUrl = policy.createScriptURL("/sw.js"); // This is a TrustedScriptURL object
    }
  } catch (err) {
    console.warn("[PWA] Trusted Types policy issue; using plain string", err);
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // Immediate update check on load to pick new deploys.
        if (reg.update) {
          try {
            reg.update();
          } catch (_) {
            // Expected: ignore failed update attempt (likely offline or race)
          }
        }

        // Schedule daily update check at midnight
        function scheduleMidnightCheck() {
          const now = new Date();
          const midnight = new Date(now);
          midnight.setHours(24, 0, 0, 0);
          const msUntilMidnight = midnight - now;

          setTimeout(() => {
            if (reg.update) {
              try {
                reg.update();
              } catch (_) {
                // Expected: ignore failed update attempt (likely offline)
              }
            }
            // Schedule next midnight check
            scheduleMidnightCheck();
          }, msUntilMidnight);
        }
        scheduleMidnightCheck();

        // When back online, ask SW to refresh core assets.
        window.addEventListener("online", () => {
          // Trigger a manual update check for the SW itself.
          if (reg.update) {
            try {
              reg.update();
            } catch (_) {
              // Expected: ignore failed update attempt (likely offline)
            }
          }
          // Send refresh message to active controller.
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: "refreshAssets" });
          }
        });

        // If we already have a controller, request asset refresh if we're online at startup.
        if (navigator.onLine && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "refreshAssets" });
        }

        // Listen for asset update notifications (optional UI hook)
        navigator.serviceWorker.addEventListener("message", (evt) => {
          if (evt.data && evt.data.type === "asset-updated") {
            // Could implement a toast; for now just log.
            // console.log(`[PWA] Updated: ${evt.data.url}`);
          }
        });

        // If a new waiting worker appears, auto-skipWaiting (fast path) then reload.
        function attemptActivation() {
          if (reg.waiting) {
            reg.waiting.postMessage("skipWaiting");
          }
        }
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              attemptActivation();
            }
          });
        });

        // After controllerchange, reload once to take advantage of the new SW.
        let refreshed = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshed) return; // prevent double reloads
          refreshed = true;
          window.location.reload();
        });
      })
      .catch((e) => {
        if (e && /TrustedScriptURL/i.test(String(e))) {
          console.error(
            "[PWA] SW registration blocked by Trusted Types; verify CSP includes: trusted-types ai-horizon-sw",
            e
          );
        } else {
          console.warn("[PWA] Service worker registration failed", e);
        }
      });
  });
})();
