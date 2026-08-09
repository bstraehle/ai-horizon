---
name: update-readme-after-feature
description: "Update README.md after a feature change. Use when adding, removing, or changing user-facing behavior, setup steps, configuration, controls, deployment details, or limitations so project documentation stays accurate."
argument-hint: "Describe the feature change, files touched, and what behavior or setup changed."
user-invocable: true
disable-model-invocation: false
---

# Update README After Feature Change

Use this skill when a code change may have made the main project documentation stale.

## What This Skill Produces

- An updated README.md that reflects the current feature behavior, setup, usage, or constraints.
- A short explanation of what changed in the documentation and what was intentionally left unchanged.

## When to Use

- A feature adds, removes, or changes user-visible behavior.
- Setup steps, environment requirements, commands, or deployment behavior changed.
- Controls, configuration, integration points, or limitations changed.
- A bug fix changed documented behavior or removed a previously documented caveat.

## Procedure

1. Identify the documentation impact.
   Read the requested change, inspect the touched files, and form a concrete view of what changed for users, developers, operators, or integrators.

2. Decide whether README.md is the right document.
   Update README.md when the change affects project overview, setup, usage, controls, configuration, behavior, troubleshooting, deployment, or prominent limitations.
   If the change belongs only in a more specialized document, update that document instead and explain why README.md did not need changes.

3. Find the smallest relevant README sections.
   Prefer narrow edits to existing sections such as features, setup, controls, architecture overview, deployment, configuration, troubleshooting, or known limitations. Avoid broad rewrites unless the structure is already inaccurate.

4. Make the README change.
   Keep the wording concrete and user-facing. Document the current behavior, prerequisites, commands, defaults, caveats, and constraints that matter to someone using or modifying the project.

5. Check for drift and consistency.
   Verify that README claims still match the implementation, package scripts, current commands, filenames, and any linked docs mentioned in the edited sections.

6. Confirm completion in the final response.
   State whether README.md was updated, which sections changed, and whether any related documentation still needs follow-up elsewhere.

## Decision Rules

- If the change is internal-only and does not alter behavior, setup, interfaces, or operator expectations, say README.md does not need an update and give the reason.
- If both README.md and a specialized doc should change, update README.md first with the high-level impact, then note the specialized doc that should also be kept in sync.
- If the implementation is ambiguous, inspect the nearest tests, docs, or configuration before editing README.md.

## Quality Bar

- Documentation must describe actual current behavior, not intended behavior.
- New text should be concise, specific, and placed in the most relevant existing section.
- Do not duplicate large blocks of content that belong in specialized docs.
- Do not leave stale commands, paths, feature flags, or constraints in neighboring text.
- Call out any uncertainty if behavior could not be fully verified from the available code or tests.

## Completion Checklist

- README impact was evaluated.
- README.md was updated when warranted, or explicitly left unchanged with a reason.
- Any changed commands, setup steps, controls, or limitations were reconciled with the codebase.
- The final response summarizes the documentation outcome and any remaining doc gaps.
