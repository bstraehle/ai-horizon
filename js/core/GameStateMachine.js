/**
 * GameStateMachine – finite state machine for high-level game flow.
 *
 * Responsibilities:
 * - Track coarse game phases (menu, running, paused, gameover).
 * - Provide narrow, intention-revealing transition helpers (start, pause, resume, end).
 * - Keep logic deterministic & side-effect free (state only), letting external systems react via events.
 *
 * Key decisions:
 * - Minimal guard clauses instead of complex transition table (states small & stable).
 * - Separate query helpers (isRunning, etc.) for readability in systems.
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
