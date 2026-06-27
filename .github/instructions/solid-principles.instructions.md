---
description: "Use when writing or refactoring JavaScript code, modules, classes, managers, systems, adapters, or tests. Enforces SOLID principles by keeping responsibilities narrow, dependencies explicit, abstractions stable, and extensions safer, and requires confirming when the guidance was applied."
name: "SOLID Principles"
applyTo: "**/*.js, **/*.cjs, **/*.mjs"
---

# SOLID Principles

- Single Responsibility Principle: keep each module, class, or function focused on one primary reason to change.
- Open/Closed Principle: prefer extending behavior through clear seams instead of repeatedly modifying one implementation with more special cases.
- Liskov Substitution Principle: interchangeable implementations must preserve the expectations and contract of the abstraction they satisfy.
- Interface Segregation Principle: keep interfaces and collaborators narrow so consumers depend only on the capabilities they actually use.
- Dependency Inversion Principle: depend on abstractions or injected collaborators at architectural boundaries instead of hard-coded low-level details.
- Treat SOLID principles as the default design baseline for code changes unless the task explicitly calls for a different tradeoff.
- Keep each module, class, or function focused on one reason to change. Split mixed responsibilities instead of adding more branches or state to an already busy unit.
- Prefer extension over modification. When behavior needs to vary, introduce a clear seam such as a strategy, adapter, policy object, or small helper instead of stacking special cases into one implementation.
- Preserve substitutability. Derived types and interchangeable implementations must honor the same expectations, side effects, and error behavior as the abstraction they satisfy.
- Keep interfaces small and task-specific. Do not force consumers to depend on methods, arguments, or state they do not use.
- Depend on abstractions or injected collaborators at architectural boundaries. Avoid hard-coding external services, storage details, or environment-specific behavior directly into core logic when a narrow seam is practical.
- Choose the smallest design that improves clarity. Do not introduce extra indirection, factories, or interfaces when a simple function or module boundary already solves the problem cleanly.
- When working in an existing area, improve local structure without forcing broad rewrites unrelated to the task.
- If a requested change conflicts with SOLID tradeoffs because of performance, game-loop timing, bundle size, or local codebase constraints, call out the tradeoff and use the smallest pragmatic design that contains the coupling.
- In the final response for relevant changes, explicitly state whether SOLID guidance was applied and note any intentional exceptions, tradeoffs, or areas not fully refactored.
