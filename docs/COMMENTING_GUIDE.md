# Commenting & JSDoc Style Guide

This project uses **JSDoc + inline narrative comments** to balance type safety (with `// @ts-check` friendly annotations) and approachability.

## Goals

- Explain _why_ non-obvious code exists (decision rationale > restating code).
- Provide accurate type information for editors and tests without TypeScript source files.
- Keep headers concise: purpose, design constraints, performance or safety notes.
- Avoid noisy or outdated comments by preferring self‑documenting names first.

## File Header Block

Add (or maintain) a top block for complex / central modules:

```
/**
 * ModuleName – one‑line purpose.
 *
 * Responsibilities:
 * - Bullet points (≤5) of what this module does.
 * - Optional design/perf notes (immutability, pooling, timing, etc.).
 *
 * Key decisions:
 * - Short tradeoff notes when relevant.
 */
```

Skip header if the file is a tiny leaf (e.g. a simple data container) already obvious by name.

## Class JSDoc

```
/**
 * Concise one‑line summary.
 * Longer paragraph if needed (wrapped at ~100 cols).
 *
 * Usage example (optional):
 * @example
 * const pool = new ObjectPool(createBullet, resetBullet, { maxSize: 256 });
 */
class Something { }
```

## Constructor & Methods

- Each public method: `@param`, `@returns` (omit `@returns` only when `void` is trivially obvious and already stated in description).
- Group params on separate lines for readability when >2 or with optional values.
- Put optional params in brackets and document defaults.
- Private helpers: prefix description with `Internal:` or mark with `@private`.

Example:

```
/**
 * Acquire an object (creates if pool empty).
 * @param {...any} args Init args forwarded to factory/reset.
 * @returns {T} Recycled or new instance.
 */
acquire(...args) { }
```

## Inline Comments

Use sparingly:

- BEFORE a block: explain intent or algorithmic nuance.
- Avoid end‑of‑line noise unless clarifying a magic literal.
- Prefer section dividers for long functions:
  `// ---- Collision phase: bullets vs asteroids ----`

## Event Names & Payloads

Centralize in `types.js`. Do not duplicate shapes in other files; reference via import JSDoc (e.g. `@param {import('./types.js').GameEvent}`) so changes propagate.

## Pools & Performance

When code defends against GC, timing spikes, or allocation churn, call that out in a short comment.

## Avoid

- Commenting obvious setters/getters.
- Large ASCII banners.
- Using comments to disable lint unless unavoidable (add rationale when you must).

## Checklist When Editing

- Did you remove obsolete comments while adding new ones?
- Did you avoid restating code literally?
- Are param names and types aligned with implementation?
- Are magic numbers either named in `CONFIG` or justified inline?

## Tag Conventions

- `@internal` (descriptive only; no tooling effect here) for things not meant for external use.
- `@deprecated` with a short replacement note when applicable.

## Future Enhancements

- Consider adding a doc generation step (e.g. TypeDoc via TS migration) once more of the codebase is strict‑typed.

---

Brief, accurate, intent‑focused commentary > exhaustive narration. Keep it lean.
