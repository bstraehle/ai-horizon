// Vitest setup file: provide minimal DOM shims required by tests
if (typeof window !== "undefined") {
  if (typeof window.scrollTo !== "function") {
    window.scrollTo = function () {
      // no-op for tests
    };
  }
}
