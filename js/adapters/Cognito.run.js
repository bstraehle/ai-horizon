// Runner for the Cognito adapter demo. Calls main() against the real endpoint.
// Requires environment with network access and valid Cognito unauth role.
import { main } from "./Cognito.js";

// Execute without mocks; this will call your real endpoint
(async () => {
  try {
    await main();
  } catch (err) {
    console.error("Runner error:", err);
  }
})();
