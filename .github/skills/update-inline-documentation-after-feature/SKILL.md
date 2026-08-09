---
name: update-inline-documentation-after-feature
description: "Update inline documentation after a feature change. Use when classes, modules, methods, functions, public APIs, lifecycle behavior, or invariants changed and code comments or doc blocks should be brought back in sync without adding noisy line-by-line comments inside method bodies."
argument-hint: "Describe the feature change, files touched, and which code-level documentation should stay aligned."
user-invocable: true
disable-model-invocation: false
---

# Update Inline Documentation After Feature Change

Use this skill when a code change may have made nearby code-level documentation stale.

## What This Skill Produces

- Updated inline documentation that matches the current implementation.
- Documentation changes focused on module, class, method, function, or API-contract level comments.
- Repo-aligned JSDoc and inline comments that follow the local commenting guide for headers, public methods, and non-obvious implementation notes.
- A short summary of what documentation changed and what was intentionally left undocumented.

## When to Use

- A feature changes the responsibility, contract, lifecycle, or invariants of a class, module, or function.
- A public or semi-public method gains new inputs, outputs, side effects, failure cases, or timing behavior.
- A bug fix changes behavior that existing doc comments describe.
- A refactor leaves comments, doc blocks, or overview notes out of sync with the code.

## Procedure

1. Identify the documentation impact.
   Read the requested change, inspect the touched implementation, and state what behavior or contract changed before editing comments.

2. Find the nearest owning documentation surface.
   Prefer updating the smallest nearby documentation unit that owns the behavior, such as a module header, class doc block, method doc block, function comment, or interface contract note.

3. Decide whether documentation should change at all.
   Update inline documentation only when it explains intent, responsibility, usage constraints, side effects, invariants, sequencing, or non-obvious behavior that a reader would otherwise infer incorrectly.
   If the code is already self-explanatory and no stale comment exists, leave it undocumented and say why.

4. Prefer higher-level comments over line-by-line narration.
   Document what the class, module, or method is responsible for, what inputs or outputs matter, and what important constraints apply.
   Do not add comments that narrate each statement inside a method unless a compact block comment is needed to explain a genuinely non-obvious algorithm or control-flow section.

5. Apply the repository commenting style.
   For complex or central modules, maintain a short top-level header that states purpose, responsibilities, and important design or performance notes.
   For classes, keep a concise JSDoc summary and add a short usage example only when it materially helps readers.
   For public methods, document `@param` entries and `@returns` when the return contract is not trivially obvious.
   For private helpers, mark the documentation as internal or private when that boundary matters to readers.

6. Keep comments synchronized with the implementation.
   Ensure names, defaults, side effects, return behavior, error conditions, timing assumptions, and state transitions mentioned in comments match the current code.

7. Capture rationale, not narration.
   Prefer comments that explain intent, tradeoffs, sequencing, pooling or performance constraints, safety guards, or other non-obvious decisions.
   Keep inline comments before the relevant block and avoid end-of-line noise except for clarifying a magic literal or similarly opaque value.

8. Keep the edit minimal and local.
   Prefer updating or removing stale comments over adding new commentary everywhere. Delete misleading comments rather than preserving inaccurate detail.

9. Avoid duplicating shared type or event definitions.
   When documenting shared event payloads or common shapes, prefer referencing the owning type location instead of restating the structure in multiple places.

10. Validate the touched slice.
    Run the cheapest relevant validation for the changed file or feature slice when practical so the documented behavior is checked against the current implementation.

11. Confirm completion in the final response.
    State which documentation surfaces changed, why those comments were needed, and whether any nearby comments were intentionally left unchanged or removed.

## Decision Rules

- If the change affects public behavior, contracts, or non-obvious invariants, prefer class-level, module-level, or method-level documentation.
- If the change is internal and the code is clear without comments, explain that no inline documentation update is needed.
- If a comment duplicates obvious code, remove or simplify it instead of expanding it.
- If multiple documentation surfaces could describe the change, choose the closest owner with the least duplication.
- If behavior is ambiguous, inspect nearby tests, call sites, or existing docs before editing comments.

## Quality Bar

- Documentation must describe actual current behavior, not intended or historical behavior.
- Comments should explain responsibility, contract, constraints, side effects, or intent rather than restating syntax.
- For complex modules, prefer a concise header covering purpose, responsibilities, and key design decisions.
- Public method docs should keep parameter names, optional/default behavior, and return contracts aligned with implementation.
- Internal helpers should be clearly marked when documenting them adds value.
- Prefer class, module, method, and function documentation over comments on individual lines inside method bodies.
- New wording should be concise, specific, and consistent with surrounding style.
- Remove stale or misleading comments when they cannot be corrected cleanly.

## Completion Checklist

- Inline documentation impact was evaluated.
- The nearest relevant documentation surface was updated, removed, or intentionally left unchanged with a reason.
- Comments were kept at class, module, method, or function level unless a deeper block comment was clearly justified.
- Repo commenting conventions were applied where relevant: module header blocks, JSDoc for public methods, and intent-first inline comments.
- Any touched documentation was reconciled with current behavior through code inspection and practical validation.
- The final response summarizes the documentation outcome and any remaining documentation gaps.
