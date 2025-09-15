/**
 * constants.js – canonical source of configuration & design tokens.
 *
 * Responsibilities:
 * - Centralize visual palettes, sizing, physics & timing constants used across subsystems.
 * - Expose tunable gameplay parameters (spawn rates, scoring, cooldowns) for rapid iteration.
 * - Provide immutability guarantees (deep freeze) to prevent accidental runtime mutation.
 *
 * Conventions:
 * - Group related values under a high‑level namespace (ASTEROID, PLAYER, STARFIELD, etc.).
 * - Avoid hard‑coding numbers elsewhere in the codebase—add a named constant here instead.
 * - Use UPPER_SNAKE_CASE leaf properties; nested objects act as namespacing.
 *
 * Rationale:
 * - A single authoritative module improves discoverability for balancing & theming.
 * - Deep freezing surfaces mistakes early (attempted mutation throws in strict mode) and
 *   allows safe sharing of references without defensive cloning.
 */
const COLORS = deepFreeze({
  ASTEROID: {
    GRAD_IN: "#d4d4d4",
    GRAD_MID: "#b2b2b2",
    CRATER: "#9a9a9a",
    GRAD_OUT: "#4a4a4a",
    OUTLINE: "#242424",
    RING: "#8e8e8e",
  },
  ASTEROID_PLANETS: [
    {
      NAME: "MONO_DARK",
      CRATER: "#4e4e4e",
      GRAD_IN: "#a2a2a2",
      GRAD_MID: "#555555",
      GRAD_OUT: "#161616",
      OUTLINE: "#080808",
      RING: "#383838",
      SHIELD: "#121212",
      SPEED_FACTOR: 0.55,
    },
  ],
  BACKGROUND: {
    BOTTOM: "#444",
    MID: "#222",
    TOP: "#000",
  },
  BULLET: {
    GRAD_BOTTOM: "#ff4444",
    GRAD_MID: "#ff8e8e",
    GRAD_TOP: "#ff6b6b",
    SHADOW: "#ff6b6b",
    TRAIL: "rgba(255, 107, 107, 0.5)",
  },

  EXPLOSION: {
    GRAD_IN: "rgba(255, 255, 255, ",
    GRAD_MID1: "rgba(255, 200, 100, ",
    GRAD_MID2: "rgba(255, 100, 50, ",
    GRAD_OUT: "rgba(255, 50, 0, 0)",
  },
  NEBULA: {
    N1: "rgba(122, 12, 12, 0.11)",
    N1_OUT: "rgba(122, 12, 12, 0)",
    N2: "rgba(105, 10, 10, 0.10)",
    N2_OUT: "rgba(105, 10, 10, 0)",
    N3: "rgba(140, 28, 20, 0.095)",
    N3_OUT: "rgba(140, 28, 20, 0)",
    N4: "rgba(90, 8, 8, 0.12)",
    N4_OUT: "rgba(90, 8, 8, 0)",
  },
  PLAYER: {
    COCKPIT: "#b20000",
    GRAD_BOTTOM: "#fff",
    GRAD_MID: "#ddd",
    GRAD_TOP: "#000",
    GUN: "#b20000",
    OUTLINE: "#bbb",
    SHADOW: "#000",
  },
  STAR: {
    BASE: "#c4c4c4",
    GRAD_IN: "#c4c4c4",
    GRAD_MID: "#909090",
    GRAD_OUT: "#909090",
  },
  STAR_RED: {
    BASE: "#c4c4c4",
    GRAD_IN: "#c4c4c4",
    GRAD_MID: "#7a0c0c",
    GRAD_OUT: "#7a0c0c",
  },
  UI: {
    OVERLAY_BACKDROP: "rgba(0,0,0,0.5)",
    OVERLAY_TEXT: "#fff",
  },
  SCORE: { DANGER_RED: "#b0b0b0" },
});

export const CONFIG = deepFreeze({
  TWO_PI: Math.PI * 2,
  VIEW: {
    DPR_MIN: 1,
    DPR_MAX: 3,
    DPR_MOBILE_MAX: 1.5,
  },
  ASTEROID: {
    HORIZONTAL_MARGIN: 40,
    MIN_SIZE: 25,
    SIZE_VARIATION: 50,
    SPAWN_Y: -40,
    REGULAR_SIZE_FACTOR: 0.85,
    INDESTRUCTIBLE_SIZE_FACTOR: 1.6,
    INDESTRUCTIBLE_SPEED_FACTOR: 0.55,
    SPEED_VARIATION: 120,
    SHIELD_FLASH_TIME: 0.15,
    INDESTRUCTIBLE_HITS: 10,
    SHIELD_FLASH_EXTRA_ALPHA: 0.4,
    CRATER_EMBOSS: {
      ENABLE: true,
      COUNT_BASE: 3,
      COUNT_VAR: 2,
      SIZE_MIN: 2,
      SIZE_FACTOR: 0.3,
      LIGHT_DIR: { x: -0.7, y: -0.7 },
      HIGHLIGHT_ALPHA: 0.35,
      SHADOW_ALPHA_INNER: 0.45,
      SHADOW_ALPHA_MID: 0.25,
      EXTRA_MAX: 4,
      SHADOW_DARKEN_SCALE: 0.5,
      HIGHLIGHT_FADE_SCALE: 0.4,
      REVEAL_TIME: 0.25,
      REVEAL_EASE: "outQuad",
      PUFF_ENABLE: true,
      PUFF_COUNT: 9,
      PUFF_LIFE: 0.55,
      PUFF_LIFE_VAR: 0.2,
      PUFF_SPEED: 170,
      PUFF_SPEED_VAR: 110,
      PUFF_SIZE_MIN: 1.2,
      PUFF_SIZE_VAR: 1.6,
      PUFF_COLOR: "rgba(210,200,190,0.9)",
    },
  },
  BULLET: {
    HEIGHT: 15,
    SPAWN_OFFSET: 0,
    TRAIL: 10,
    WIDTH: 4,
    SHADOW_BLUR: 8,
  },
  COLORS: COLORS,
  EXPLOSION: {
    LIFE: 0.25,
    OFFSET: 25,
    PARTICLE_COUNT: 15,
    PARTICLE_LIFE: 0.5,
    PARTICLE_SPEED_VAR: 480,
    PARTICLE_SIZE_MIN: 2,
    PARTICLE_SIZE_VARIATION: 4,
    SIZE: 50,
    SCALE_GAIN: 2,
  },
  PARTICLE: {
    GRAVITY: 360,
  },
  ENGINE_TRAIL: {
    SPEED: 120,
    LIFE: 0.33,
    SPAWN_JITTER: 4,
    SIZE_MIN: 1,
    SIZE_MAX: 3,
    DRAW_SIZE_MULT: 2,
  },
  GAME: {
    ASTEROID_SCORE: 10,
    ASTEROID_SCORE_INDESTRUCTIBLE: 100,
    ASTEROID_SPAWN_RATE: 2.0,
    SHOT_COOLDOWN: 200,
    STARFIELD_COUNT: 150,
    STARFIELD_COUNT_MOBILE: 80,
    STAR_SCORE: 20,
    STAR_SCORE_RED: 50,
    STAR_SPAWN_RATE: 1.0,
    ASTEROID_SPAWN_RATE_DESKTOP: 4.0,
    ASTEROID_SPAWN_RATE_MOBILE: 1.5,
    STAR_SPAWN_RATE_DESKTOP: 2.0,
    STAR_SPAWN_RATE_MOBILE: 1.0,
    STAR_YELLOW_BEFORE_RED: 4,
    ASTEROID_NORMAL_BEFORE_INDESTRUCTIBLE: 4,
    TIMER_SECONDS: 60,
  },
  INPUT: {
    CONFIRM_CODES: ["Enter"].sort(),
    FIRE_CODES: ["Space"].sort(),
    MOVEMENT_CODES: [
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "KeyA",
      "KeyD",
      "KeyS",
      "KeyW",
    ],
    PAUSE_CODES: ["Escape"],
    PAUSE_KEYS: ["Esc", "Escape"],
  },
  RNG: {
    SEED_PARAM: "seed",
  },
  NEBULA: {
    COUNT_DESKTOP: 6,
    COUNT_MOBILE: 3,
    RADIUS_MAX_DESKTOP: 220,
    RADIUS_MAX_MOBILE: 110,
    RADIUS_MIN_DESKTOP: 90,
    RADIUS_MIN_MOBILE: 45,
    BLOB_COUNT_BASE_DESKTOP: 4,
    BLOB_COUNT_VAR_DESKTOP: 2,
    BLOB_COUNT_BASE_MOBILE: 2,
    BLOB_COUNT_VAR_MOBILE: 2,
    BLOB_MIN_FACTOR: 0.35,
    BLOB_VAR_FACTOR: 0.55,
    WOBBLE_AMP_MIN: 4,
    WOBBLE_AMP_VAR: 8,
    WOBBLE_RATE_BASE: 0.002,
    WOBBLE_RATE_VAR: 0.004,
    WOBBLE_RATE_SCALE: 60,
    SPEED_JITTER: 0.4,
    SPEED_SCALE: 60,
    RADIUS_RATE_JITTER: 0.15,
    RADIUS_RATE_SCALE: 60,
  },
  PLAYER: {
    SPAWN_Y_OFFSET: 100,
    MOUSE_LERP: 6,
    DRAW: {
      OUTLINE_WIDTH: 2.5,
      COCKPIT_RX: 4,
      COCKPIT_RY: 3,
      GUN_WIDTH: 4,
      GUN_HEIGHT: 10,
      GUN_OFFSET_Y: -8,
    },
  },
  SIZES: {
    PLAYER: 25,
  },
  SPEEDS: {
    ASTEROID_DESKTOP: 200,
    ASTEROID_MOBILE: 150,
    BULLET: 480,
    PLAYER: 480,
    STAR: 100,
  },
  STARFIELD: {
    SIZE_MIN: 0.5,
    SIZE_VAR: 2,
    SPEED_MIN: 6,
    SPEED_VAR: 30,
    BRIGHTNESS_MIN: 0.5,
    BRIGHTNESS_VAR: 0.5,
    RESET_Y: -5,
    TWINKLE_RATE: 4,
    TWINKLE_X_FACTOR: 0.01,
    SHADOW_BLUR_MULT: 2,
    LAYERS: [
      {
        name: "far",
        countFactor: 0.4,
        sizeMult: 0.6,
        speedMult: 0.35,
        brightnessMult: 0.7,
        twinkleRate: 2.5,
      },
      {
        name: "mid",
        countFactor: 0.35,
        sizeMult: 0.9,
        speedMult: 0.6,
        brightnessMult: 0.85,
        twinkleRate: 4,
      },
      {
        name: "near",
        countFactor: 0.25,
        sizeMult: 1.2,
        speedMult: 1.1,
        brightnessMult: 1.1,
        twinkleRate: 6,
      },
    ],
  },
  STAR: {
    HORIZONTAL_MARGIN: 20,
    MIN_SIZE: 15,
    SHADOW_BLUR: 15,
    SPEED_VARIATION: 30,
    PARTICLE_BURST: 12,
    PARTICLE_LIFE: 0.33,
    PARTICLE_SIZE_MIN: 1,
    PARTICLE_SIZE_VARIATION: 2,
    PARTICLE_BURST_SPEED_MIN: 120,
    PARTICLE_BURST_SPEED_VAR: 180,
    PULSE: false,
    PULSE_AMPLITUDE: 0.2,
    PULSE_SPEED: 1,
    SIZE_VARIATION: 30,
    SPAWN_Y: -20,
  },
  TIME: {
    DEFAULT_DT: 1 / 60,
    STEP_MS: 1000 / 60,
    MAX_SUB_STEPS: 5,
  },
  UI: {
    PAUSE_OVERLAY: {
      BACKDROP: COLORS.UI.OVERLAY_BACKDROP,
      FONT: "bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      MESSAGE: "Paused - Esc to resume",
      TEXT_ALIGN: "center",
      TEXT_BASELINE: "middle",
      TEXT_COLOR: COLORS.UI.OVERLAY_TEXT,
    },
  },
});

export const PI2 = Math.PI * 2;
/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * Deeply freezes an object to make it immutable at all nested levels.
 * Note: Only freezes plain objects/arrays; primitives are ignored by Object.freeze.
 * @param {any} obj
 * @returns {any} The same object, deeply frozen
 */
function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const value = obj[prop];
      if (value && typeof value === "object") {
        deepFreeze(value);
      }
    });
    Object.freeze(obj);
  }
  return obj;
}
