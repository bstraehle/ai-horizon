---
description: "Simplify and reduce bloated code in open files. Use when refactoring overly complex functions, modules, classes, conditionals, or control flow while preserving behavior."
name: "Simplify Bloated Code"
argument-hint: "Describe the file, symbol, or behavior to simplify and any constraints to preserve."
agent: "agent"
---

Simplify the requested code in the currently open file or files without changing intended behavior.

Focus on a single refactoring task:

- reduce unnecessary branching, duplication, or indirection
- split mixed responsibilities when a clearer local boundary helps
- remove dead or redundant code when it is safe to do so
- preserve public behavior, existing contracts, and nearby code style

How to work:

1. Start from the currently open file or files, using the specific symbol or behavior I mention when provided.
2. Identify the smallest local slice that is bloated or overly complex.
3. Prefer the simplest design that improves clarity instead of introducing new abstraction layers by default.
4. Keep edits narrow and behavior-preserving unless I explicitly ask for broader redesign.
5. After the first substantive edit, run the narrowest relevant validation available for the touched slice.

When responding:

- make the refactoring directly instead of only proposing it
- call out important tradeoffs if simplification would risk changing behavior
- summarize what was simplified and what validation was run

If multiple files are open, prioritize the most concrete target I mention. If my request is broad, narrow it to the smallest relevant slice within the open files before expanding scope.
