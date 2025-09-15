/**
 * GameStateMachine – minimal finite state controller for macro game phases.
 *
 * Phases:
 * - menu → running → paused ↔ running → gameover (restart returns to running via start()).
 *
 * Responsibilities:
 * - Provide intention‑revealing transitions (start, pause, resume, end) with simple guards.
 * - Keep surface area tiny to discourage ad‑hoc boolean flags sprinkled across modules.
 * - Offer predicate helpers (isRunning, isPaused, etc.) for readable conditionals in systems.
 *
 * Design choices:
 * - No external event emission; higher‑level orchestration handles side effects (UI, audio, etc.).
 * - Chose explicit methods over a data‑driven table: state count is small & unlikely to explode.
 */
export class GameStateMachine {
  constructor() {
    /** @type {'menu' | 'running' | 'paused' | 'gameover'} */
    this.state = "menu";
  }

  /** @returns {boolean} */ isRunning() {
    return this.state === "running";
  }
  /** @returns {boolean} */ isPaused() {
    return this.state === "paused";
  }
  /** @returns {boolean} */ isMenu() {
    return this.state === "menu";
  }
  /** @returns {boolean} */ isGameOver() {
    return this.state === "gameover";
  }

  /** Transition to running from menu/gameover/paused. */
  start() {
    if (this.state === "menu" || this.state === "gameover" || this.state === "paused") {
      this.state = "running";
    }
  }

  /** Pause only when running. */
  pause() {
    if (this.state === "running") this.state = "paused";
  }

  /** Resume only when paused. */
  resume() {
    if (this.state === "paused") this.state = "running";
  }

  /** Move to gameover from running or paused. */
  end() {
    if (this.state === "running" || this.state === "paused") this.state = "gameover";
  }
}
