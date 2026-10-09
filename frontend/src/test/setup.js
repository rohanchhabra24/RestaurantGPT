import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without test.globals:true in vite.config.js, Testing Library's own
// auto-cleanup (which checks for a global afterEach) never registers —
// renders silently accumulate across tests in the same file instead of
// each test starting from an empty document, which showed up as
// "multiple elements found" failures for queries that were only
// ambiguous because the previous test's render was still in the DOM.
afterEach(() => {
  cleanup();
});
