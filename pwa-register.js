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
    // Some browsers without Trusted Types support may not accept an object; coerce if needed.
    // Pass the TrustedScriptURL directly if present; browsers doing enforcement will accept it.
    navigator.serviceWorker.register(swUrl).catch((e) => {
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
