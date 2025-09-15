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

  /**
   * Predicate: is the simulation actively advancing?
   * @returns {boolean}
   */
  isRunning() {
    return this.state === "running";
  }
  /**
   * Predicate: is the game temporarily halted (can resume to running)?
   * @returns {boolean}
   */
  isPaused() {
    return this.state === "paused";
  }
  /**
   * Predicate: initial/menu state (pre-game or after full reset).
   * @returns {boolean}
   */
  isMenu() {
    return this.state === "menu";
  }
  /**
   * Predicate: terminal state until player initiates a restart.
   * @returns {boolean}
   */
  isGameOver() {
    return this.state === "gameover";
  }

  /**
   * Transition: running.
   * Allowed From: menu | gameover | paused.
   * No-op if already running.
   */
  start() {
    if (this.state === "menu" || this.state === "gameover" || this.state === "paused") {
      this.state = "running";
    }
  }

  /**
   * Transition: paused.
   * Allowed From: running.
   * No-op otherwise.
   */
  pause() {
    if (this.state === "running") this.state = "paused";
  }

  /**
   * Transition: running (resume).
   * Allowed From: paused.
   * No-op otherwise.
   */
  resume() {
    if (this.state === "paused") this.state = "running";
  }

  /**
   * Transition: gameover.
   * Allowed From: running | paused.
   * No-op otherwise.
   */
  end() {
    if (this.state === "running" || this.state === "paused") this.state = "gameover";
  }
}
