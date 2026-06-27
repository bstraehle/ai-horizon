---
description: "Use when writing or changing web UI code, markup, styling, or interaction behavior. Enforces WCAG 2.2 accessibility checks for keyboard access, focus handling, labels, contrast, target size, motion, and screen reader support, and requires confirming when the guidance was applied."
name: "WCAG 2.2 Accessibility"
applyTo: "**/*.html, **/*.css, js/**/*.js"
---

# WCAG 2.2 Accessibility

- Treat WCAG 2.2 AA as the baseline for user-facing changes unless the task explicitly says otherwise.
- Preserve full keyboard operability. Do not require pointer-only interactions, and keep logical tab order, visible focus states, and reliable focus management after dialogs, overlays, game state changes, or dynamic updates.
- Ensure interactive elements are keyboard reachable and actionable. Prefer native buttons for actions and native links for navigation instead of clickable generic containers.
- Keep visible focus indicators intact. Do not remove outlines unless a clear, accessible replacement focus style is present.
- Use semantic HTML first. Prefer native buttons, links, headings, lists, and form controls over generic containers with ARIA.
- For images, provide meaningful `alt` text when the image conveys information, and use empty `alt=""` for decorative images.
- Provide accessible names and instructions for interactive controls. Inputs, buttons, icons, status messages, and custom widgets must expose clear labels for assistive technology.
- Associate labels with form controls, ensure icon-only controls have accessible names, and provide instructions or error text when users need them to complete a task.
- Keep color from being the only way information is conveyed, and maintain accessible contrast for text, controls, focus indicators, and essential graphics.
- Do not rely on color alone to show status, selection, errors, or success. Add text, icons, patterns, or other non-color cues when meaning matters.
- Ensure touch and click targets are large enough and spaced enough for WCAG 2.2 target size expectations when practical within the existing design.
- Respect reduced-motion and reduced-distraction needs. Avoid introducing autoplaying motion, flashing, or animation that cannot be paused, stopped, or reduced when the platform requests it.
- Respect `prefers-reduced-motion` for non-essential animation and avoid motion or flashing that could distract or harm users.
- When updating dynamic UI, ensure screen readers can perceive important state changes through native semantics or appropriate live-region patterns.
- Use appropriate status messaging for async loading, validation, score changes, or modal state changes when users would otherwise miss the update.
- If a requested design or implementation conflicts with WCAG 2.2, call out the conflict clearly and propose the smallest accessible alternative.
- In the final response for relevant changes, explicitly state whether WCAG 2.2 guidance was applied and note any known gaps, assumptions, or areas not fully verified.
