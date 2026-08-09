---
name: update-unit-test-after-feature
description: "Update unit tests after a feature change. Use when behavior, state transitions, inputs, outputs, edge cases, or regressions changed and nearby Vitest coverage should be updated or added to keep tests aligned with the implementation."
argument-hint: "Describe the feature change, files touched, expected behavior, and any existing failing or nearby tests."
user-invocable: true
disable-model-invocation: false
---

# Update Unit Test After Feature Change

Use this skill when a code change may require unit-test updates in the existing Vitest suite.

## What This Skill Produces

- Updated or newly added unit tests that reflect the current feature behavior.
- A focused validation run for the touched test slice when practical.
- A short summary of what test coverage changed and any remaining gaps.

## When to Use

- A feature adds, removes, or changes observable behavior.
- State-machine behavior, scoring, timing, persistence, UI gating, or edge-case handling changed.
- A bug fix needs regression coverage.
- Existing tests now fail because the intended behavior changed.

## Procedure

1. Identify the behavior delta.
   Inspect the requested feature change, the touched code, and the nearest existing tests. State the specific behavior that changed in a falsifiable way before editing tests.

2. Find the smallest affected test surface.
   Prefer updating the nearest existing test file that already owns the behavior. Add a new test file only when no nearby file provides a clear home for the scenario.

3. Decide whether to update or add coverage.
   Update assertions when the expected behavior intentionally changed. Add a new test when the change introduces a new branch, regression risk, edge case, or previously untested scenario.

4. Keep the test focused on behavior.
   Assert externally visible outcomes, state transitions, emitted events, return values, or DOM-relevant results instead of mirroring internal implementation details.

5. Cover the critical edges introduced by the change.
   Include the narrowest set of success, failure, and edge cases needed to make the behavior change hard to regress.

6. Run focused validation.
   Prefer the cheapest relevant check first, such as a targeted Vitest run for the touched file or test name. Use the broader `npm test` path only when a narrower check is unavailable or insufficient.

7. Confirm completion in the final response.
   State which tests changed, what behavior they now cover, what validation was run, and any remaining test gaps or assumptions.

## Decision Rules

- If the change is purely internal and does not alter observable behavior or regression risk, explain why no unit-test change is needed.
- If an existing test is too broad or unclear, prefer adding a narrowly named test case over rewriting large unrelated sections.
- If the implementation is ambiguous, inspect the closest tests, call sites, or feature-specific assertions before editing.
- If a feature crosses multiple slices, start with the most direct owner of the behavior and expand only when the first validation shows coverage is insufficient.

## Quality Bar

- Tests must reflect actual current behavior, not speculative future behavior.
- New coverage should be minimal, readable, and placed in the most relevant existing file when possible.
- Avoid brittle assertions tied to incidental ordering, formatting, or internals unless that detail is part of the contract.
- Preserve existing test style, naming patterns, fixtures, and helper usage in the surrounding suite.
- Call out uncertainty when behavior could not be fully verified from the code or targeted validation.

## Validation Guidance

- Prefer focused Vitest execution for the touched slice.
- Use the repo test command `npm test` when a full suite check is needed.
- If a focused command exists, run it before widening scope or editing adjacent tests.

## Completion Checklist

- Test impact was evaluated.
- The nearest relevant unit tests were updated or new coverage was added when warranted.
- Focused validation was run when practical, or the reason it was not run was stated.
- The final response summarizes the test outcome and any remaining coverage gaps.
