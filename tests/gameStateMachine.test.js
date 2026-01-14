// @ts-check
import { describe, it, expect } from "vitest";
import { GameStateMachine } from "../js/core/GameStateMachine.js";

describe("GameStateMachine", () => {
  it("starts from menu and transitions correctly", () => {
    const sm = new GameStateMachine();
    expect(sm.isMenu()).toBe(true);
    expect(sm.isRunning()).toBe(false);

    sm.start();
    expect(sm.isRunning()).toBe(true);
    expect(sm.isPaused()).toBe(false);

    sm.pause();
    expect(sm.isPaused()).toBe(true);
    expect(sm.isRunning()).toBe(false);

    sm.resume();
    expect(sm.isRunning()).toBe(true);

    sm.end();
    expect(sm.isGameOver()).toBe(true);
  });

  it("start is no-op when already running", () => {
    const sm = new GameStateMachine();
    sm.start();
    expect(sm.isRunning()).toBe(true);
    sm.start();
    expect(sm.isRunning()).toBe(true);
  });

  it("pause is no-op when not running", () => {
    const sm = new GameStateMachine();
    expect(sm.isMenu()).toBe(true);
    sm.pause();
    expect(sm.isMenu()).toBe(true);
    expect(sm.isPaused()).toBe(false);
  });

  it("resume is no-op when not paused", () => {
    const sm = new GameStateMachine();
    sm.start();
    expect(sm.isRunning()).toBe(true);
    sm.resume();
    expect(sm.isRunning()).toBe(true);
  });

  it("end is no-op when in menu state", () => {
    const sm = new GameStateMachine();
    expect(sm.isMenu()).toBe(true);
    sm.end();
    expect(sm.isMenu()).toBe(true);
    expect(sm.isGameOver()).toBe(false);
  });

  it("can restart from gameover state", () => {
    const sm = new GameStateMachine();
    sm.start();
    sm.end();
    expect(sm.isGameOver()).toBe(true);
    sm.start();
    expect(sm.isRunning()).toBe(true);
  });

  it("can end from paused state", () => {
    const sm = new GameStateMachine();
    sm.start();
    sm.pause();
    expect(sm.isPaused()).toBe(true);
    sm.end();
    expect(sm.isGameOver()).toBe(true);
  });

  it("start from paused state resumes to running", () => {
    const sm = new GameStateMachine();
    sm.start();
    sm.pause();
    expect(sm.isPaused()).toBe(true);
    sm.start();
    expect(sm.isRunning()).toBe(true);
  });
});
