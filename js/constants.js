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
/**
 * Deep freeze helper (non-exported) used to recursively freeze configuration objects.
 * @param {any} obj
 * @returns {any}
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

/**
 * Visual palette – "deep-space neon": a near-black indigo field, cyan for everything that belongs to
 * the player (ship, bolts, UI accent), warm gold for pickups, hot orange/red for danger, and
 * violet/pink vs. cyan/teal nebula sets that alternate between runs. Asteroid palettes carry a RIM
 * (lit edge) and GLOW colour used by the lit-vector renderer; SPEED_FACTOR remains gameplay data.
 */
const COLORS = deepFreeze({
  ASTEROID: {
    NAME: "SLATE",
    GRAD_IN: "#a3b3d3",
    GRAD_MID: "#4c5878",
    GRAD_OUT: "#141a2f",
    CRATER: "#2c3554",
    OUTLINE: "#070a16",
    RIM: "#c9d8f7",
    RING: "#6b7a9c",
  },
  ASTEROID_RED: {
    NAME: "DANGER_RED",
    GRAD_IN: "#ff9a9a",
    GRAD_MID: "#c81e3c",
    GRAD_OUT: "#3a0713",
    CRATER: "#5a0f22",
    OUTLINE: "#1a0308",
    RIM: "#ffd6cf",
    RING: "#ff5a3d",
    SHIELD: "#ff3b5c",
    GLOW: "rgba(255, 59, 92, 0.6)",
    SPEED_FACTOR: 0.6,
  },
  ASTEROID_BLUE: {
    NAME: "DANGER_BLUE",
    GRAD_IN: "#9cf6ff",
    GRAD_MID: "#0ea5c9",
    GRAD_OUT: "#062a3f",
    CRATER: "#0a3a4f",
    OUTLINE: "#031018",
    RIM: "#e0fcff",
    RING: "#22d3ee",
    SHIELD: "#4ff2ff",
    GLOW: "rgba(79, 242, 255, 0.55)",
    SPEED_FACTOR: 0.6,
  },
  ASTEROID_HARDENED: [
    {
      NAME: "OBSIDIAN",
      GRAD_IN: "#626c84",
      GRAD_MID: "#262c3d",
      GRAD_OUT: "#090b13",
      CRATER: "#181c2a",
      OUTLINE: "#04050a",
      RIM: "#a4b0cc",
      RING: "#3b4257",
      SHIELD: "#ff8a3d",
      GLOW: "rgba(255, 138, 61, 0.5)",
      SPEED_FACTOR: 0.55,
    },
    {
      NAME: "RUST",
      GRAD_IN: "#d1955f",
      GRAD_MID: "#6f3b21",
      GRAD_OUT: "#1c0c07",
      CRATER: "#3b1c10",
      OUTLINE: "#0d0503",
      RIM: "#f5d2ad",
      RING: "#8a4a2b",
      SHIELD: "#ffb347",
      GLOW: "rgba(255, 179, 71, 0.5)",
      SPEED_FACTOR: 0.55,
    },
    {
      NAME: "ICE",
      GRAD_IN: "#c6ecff",
      GRAD_MID: "#3f7fb3",
      GRAD_OUT: "#0a2440",
      CRATER: "#163b5a",
      OUTLINE: "#051322",
      RIM: "#f0fcff",
      RING: "#5aa9d6",
      SHIELD: "#eafcff",
      GLOW: "rgba(190, 240, 255, 0.5)",
      SPEED_FACTOR: 0.55,
    },
  ],
  BACKGROUND: {
    TOP: "#03040c",
    MID: "#0a0f2a",
    BOTTOM: "#0c1130",
    VIGNETTE: "rgba(2, 3, 10, 0.6)",
  },
  STARFIELD: {
    WHITE: "#ffffff",
    BLUE: "#c7dcff",
    WARM: "#ffe6bf",
    HERO: "#eaf6ff",
  },
  BULLET: {
    GRAD_BOTTOM: "#22d3ee",
    GRAD_MID: "#f0ffff",
    GRAD_TOP: "#a5f3fc",
    SHADOW: "#4ff2ff",
    TRAIL: "rgba(79, 242, 255, 0.35)",
  },
  BULLET_UPGRADED: {
    GRAD_BOTTOM: "#c084fc",
    GRAD_MID: "#fdf4ff",
    GRAD_TOP: "#f0abfc",
    SHADOW: "#e879f9",
    TRAIL: "rgba(232, 121, 249, 0.4)",
  },
  ENGINE_TRAIL: {
    CORE: "rgba(255, 255, 255, ",
    MID: "rgba(79, 242, 255, ",
    OUT: "rgba(34, 211, 238, 0)",
  },
  EXPLOSION: {
    GRAD_IN: "rgba(255, 255, 255, ",
    GRAD_MID1: "rgba(255, 214, 102, ",
    GRAD_MID2: "rgba(255, 106, 61, ",
    GRAD_OUT: "rgba(255, 60, 40, 0)",
    RING: "rgba(255, 210, 160, ",
  },
  NEBULA_RED: {
    N1: "rgba(168, 85, 247, 0.20)",
    N1_OUT: "rgba(168, 85, 247, 0)",
    N2: "rgba(236, 72, 153, 0.16)",
    N2_OUT: "rgba(236, 72, 153, 0)",
    N3: "rgba(255, 106, 61, 0.11)",
    N3_OUT: "rgba(255, 106, 61, 0)",
    N4: "rgba(91, 33, 182, 0.24)",
    N4_OUT: "rgba(91, 33, 182, 0)",
  },
  NEBULA_BLUE: {
    B1: "rgba(34, 211, 238, 0.17)",
    B1_OUT: "rgba(34, 211, 238, 0)",
    B2: "rgba(59, 130, 246, 0.16)",
    B2_OUT: "rgba(59, 130, 246, 0)",
    B3: "rgba(45, 212, 191, 0.12)",
    B3_OUT: "rgba(45, 212, 191, 0)",
    B4: "rgba(30, 64, 175, 0.24)",
    B4_OUT: "rgba(30, 64, 175, 0)",
  },
  PLAYER: {
    HULL_TOP: "#ffffff",
    HULL_MID: "#cfd9ec",
    HULL_BOTTOM: "#7d8dab",
    WING: "#3b4760",
    WING_EDGE: "#b3c3e0",
    COCKPIT: "#4ff2ff",
    COCKPIT_DEEP: "#0e7490",
    GUN: "#22d3ee",
    OUTLINE: "#0b1020",
    SHADOW: "#000",
    ENGINE: "#4ff2ff",
    ENGINE_CORE: "#ffffff",
  },
  STAR: {
    BASE: "#ffd166",
    GRAD_IN: "#fff7dc",
    GRAD_MID: "#ffd166",
    GRAD_OUT: "#f59e0b",
    GLOW: "rgba(255, 209, 102, 0.6)",
  },
  STAR_RED: {
    BASE: "#ff4fd8",
    GRAD_IN: "#ffe6fb",
    GRAD_MID: "#ff4fd8",
    GRAD_OUT: "#a21caf",
    GLOW: "rgba(255, 79, 216, 0.6)",
  },
  STAR_BLUE: {
    BASE: "#4ff2ff",
    GRAD_IN: "#eaffff",
    GRAD_MID: "#4ff2ff",
    GRAD_OUT: "#0891b2",
    GLOW: "rgba(79, 242, 255, 0.6)",
  },
  UI: {
    OVERLAY_BACKDROP: "rgba(3, 4, 12, 0.6)",
    OVERLAY_TEXT: "#e6f1ff",
  },
  SCORE: { POPUP: "#ffd166", POPUP_STROKE: "rgba(6, 8, 20, 0.9)" },
});

export const CONFIG = deepFreeze({
  TWO_PI: Math.PI * 2,
  VIEW: {
    DPR_MIN: 1.0,
    DPR_MAX: 1.5,
    DPR_MOBILE_MAX: 1.2,
    MAX_CANVAS_PIXELS: 9000000,
    MIN_RESOLUTION_SCALE: 0.5,
  },
  PERFORMANCE: {
    SAMPLE_WINDOW: 72,
    COOLDOWN_FRAMES: 240,
    RECOVERY_THRESHOLD_FACTOR: 0.88,
    RECOVERY_COOLDOWN_FRAMES: 180,
    WORK_BUDGET_MS: 1000 / 60,
    WORK_ESCALATE_FACTOR: 0.85,
    WORK_RECOVER_FACTOR: 0.55,
    INITIAL_LEVEL_DESKTOP: 0,
    INITIAL_LEVEL_MOBILE: 3,
    MIN_STARFIELD_SCALE: 0.25,
    LEVELS: [
      {
        thresholdMs: 20,
        starfieldScale: 0.85,
        spawnRateScale: 1,
        particleMultiplier: 0.85,
        particleBudget: 2600,
        dprMax: 1.25,
        engineTrailModulo: 1,
        cooldownFrames: 300,
        sampleWindow: 90,
      },
      {
        thresholdMs: 24,
        starfieldScale: 0.6,
        spawnRateScale: 0.75,
        particleMultiplier: 0.6,
        particleBudget: 1500,
        dprMax: 1.1,
        engineTrailModulo: 2,
        cooldownFrames: 420,
        sampleWindow: 120,
      },
      {
        thresholdMs: 30,
        starfieldScale: 0.4,
        spawnRateScale: 0.6,
        particleMultiplier: 0.4,
        particleBudget: 950,
        dprMax: 1.0,
        engineTrailModulo: 3,
        cooldownFrames: 540,
        sampleWindow: 140,
      },
      {
        thresholdMs: 36,
        starfieldScale: 0.3,
        spawnRateScale: 0.5,
        particleMultiplier: 0.3,
        particleBudget: 700,
        dprMax: 0.9,
        engineTrailModulo: 4,
        cooldownFrames: 640,
        sampleWindow: 160,
      },
    ],
  },
  ASTEROID: {
    HORIZONTAL_MARGIN: 40,
    MIN_SIZE: 25,
    SIZE_VARIATION: 50,
    SPAWN_Y: -40,
    REGULAR_SIZE_FACTOR: 0.85,
    HARDENED_SIZE_FACTOR: 1.6,
    HARDENED_SPEED_FACTOR: 0.55,
    SPEED_VARIATION: 120,
    SHIELD_FLASH_TIME: 0.15,
    HARDENED_HITS: 10,
    SHIELD_FLASH_EXTRA_ALPHA: 0.4,
    CRATER_EMBOSS: {
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
      PUFF_COUNT: 9,
      PUFF_LIFE: 0.55,
      PUFF_LIFE_VAR: 0.2,
      PUFF_SPEED: 170,
      PUFF_SPEED_VAR: 110,
      PUFF_SIZE_MIN: 1.2,
      PUFF_SIZE_VAR: 1.6,
      PUFF_COLOR: "rgba(196, 208, 236, 0.9)",
    },
  },
  BULLET: {
    WIDTH: 4,
    HEIGHT: 15,
    SHADOW_BLUR: 8,
    SPAWN_OFFSET: 0,
    TRAIL: 10,
    WIDTH_UPGRADED: 6,
    HEIGHT_UPGRADED: 18,
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
    PARTICLE_GRAY_MIN: 40,
    PARTICLE_GRAY_MAX: 80,
    PARTICLE_GRAY_STEP: 5,
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
    SIZE_MIN: 1.4,
    SIZE_MAX: 3.6,
    DRAW_SIZE_MULT: 2.4,
  },
  GAME: {
    ASTEROID_SCORE: 10,
    ASTEROID_SCORE_HARDENED: 100,
    ASTEROID_SCORE_BONUS: 250,
    ASTEROID_SPAWN_RATE: 2.0,
    SHOT_COOLDOWN: 200,
    STARFIELD_COUNT: 150,
    STARFIELD_COUNT_MOBILE: 50,
    STAR_SCORE: 25,
    STAR_SCORE_BONUS: 50,
    STAR_SPAWN_RATE: 1.0,
    ASTEROID_SPAWN_RATE_DESKTOP: 4.0,
    ASTEROID_SPAWN_RATE_MOBILE: 1.5,
    STAR_SPAWN_RATE_DESKTOP: 2.0,
    STAR_SPAWN_RATE_MOBILE: 1.0,
    STAR_NORMAL_BEFORE_BONUS: 4,
    ASTEROID_NORMAL_BEFORE_HARDENED: 4,
    BONUS_ASTEROID_COUNT: 8,
    BONUS_INTERVAL_SECONDS: 10,
    TIMER_SECONDS: 90,
    FINALE_BONUS_WINDOW_SECONDS: 15,
    FINALE_BONUS_MULTIPLIER: 2,
    SCORING_BONUS_THRESHOLD: 1000,
    SCORING_BONUS_POINTS: 250,
    BULLET_UPGRADE_SCORE: 2500,
    BULLET_UPGRADE_HARDENED_HITS_FACTOR: 0.5,
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
    COUNT_MOBILE: 2,
    RADIUS_MAX_DESKTOP: 220,
    RADIUS_MAX_MOBILE: 90,
    RADIUS_MIN_DESKTOP: 90,
    RADIUS_MIN_MOBILE: 35,
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
    LAYER_SCALE: 0.5,
    LAYER_REFRESH_FRAMES: 3,
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
    SIZE_VARIATION: 30,
    SPAWN_Y: -20,
  },
  TIME: {
    DEFAULT_DT: 1 / 60,
    STEP_MS: 1000 / 60,
    MAX_SUB_STEPS: 4,
    SNAP_TOLERANCE: 0.06,
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
