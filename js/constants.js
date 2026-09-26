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
 * Visual palette – "clean minimal": a near-black field, white and light-gray flat shapes with thin
 * dark outlines, and one accent colour per run (ACCENT.RED or ACCENT.BLUE, following the nebula
 * palette flip) reserved for the engine flame, upgraded bolts, bonus items and score popups.
 * Asteroid palettes are two-tone (FACE lit side / FACET shadow side); GRAD_* keys are kept as
 * aliases for the fallback painters. SPEED_FACTOR remains gameplay data.
 */
const COLORS = deepFreeze({
  ACCENT: {
    RED: "#ff5c5c",
    BLUE: "#4fb4ff",
    RED_SOFT: "rgba(255, 92, 92, 0.55)",
    BLUE_SOFT: "rgba(79, 180, 255, 0.55)",
  },
  ASTEROID: {
    NAME: "STONE",
    FACE: "#b9bfc9",
    FACET: "#7e8590",
    GRAD_IN: "#b9bfc9",
    GRAD_MID: "#9aa1ab",
    GRAD_OUT: "#7e8590",
    CRATER: "#6a707a",
    OUTLINE: "#0a0b0f",
    RING: "#9aa1ab",
  },
  ASTEROID_RED: {
    NAME: "DANGER_RED",
    FACE: "#ff5c5c",
    FACET: "#b83a3a",
    GRAD_IN: "#ff5c5c",
    GRAD_MID: "#d94848",
    GRAD_OUT: "#b83a3a",
    CRATER: "#8f2d2d",
    OUTLINE: "#0a0b0f",
    RING: "#ff8a8a",
    SHIELD: "#ffd6d6",
    SPEED_FACTOR: 0.6,
  },
  ASTEROID_BLUE: {
    NAME: "DANGER_BLUE",
    FACE: "#4fb4ff",
    FACET: "#2f7fbd",
    GRAD_IN: "#4fb4ff",
    GRAD_MID: "#3f98de",
    GRAD_OUT: "#2f7fbd",
    CRATER: "#256494",
    OUTLINE: "#0a0b0f",
    RING: "#8fd0ff",
    SHIELD: "#dcf1ff",
    SPEED_FACTOR: 0.6,
  },
  ASTEROID_HARDENED: [
    {
      NAME: "GRAPHITE",
      FACE: "#4a505b",
      FACET: "#2b2f37",
      GRAD_IN: "#4a505b",
      GRAD_MID: "#3a3f49",
      GRAD_OUT: "#2b2f37",
      CRATER: "#22252c",
      OUTLINE: "#0a0b0f",
      RING: "#6b7280",
      SHIELD: "#e8ebf0",
      SPEED_FACTOR: 0.55,
    },
    {
      NAME: "SLATE",
      FACE: "#636b78",
      FACET: "#3e444e",
      GRAD_IN: "#636b78",
      GRAD_MID: "#505763",
      GRAD_OUT: "#3e444e",
      CRATER: "#33383f",
      OUTLINE: "#0a0b0f",
      RING: "#8a919d",
      SHIELD: "#e8ebf0",
      SPEED_FACTOR: 0.55,
    },
    {
      NAME: "ICE",
      FACE: "#dfe6ee",
      FACET: "#a9b4c2",
      GRAD_IN: "#dfe6ee",
      GRAD_MID: "#c4cdd8",
      GRAD_OUT: "#a9b4c2",
      CRATER: "#93a0af",
      OUTLINE: "#0a0b0f",
      RING: "#ffffff",
      SHIELD: "#ffffff",
      SPEED_FACTOR: 0.55,
    },
  ],
  BACKGROUND: {
    TOP: "#04050a",
    MID: "#090a12",
    BOTTOM: "#0c0d16",
    VIGNETTE: "rgba(0, 0, 0, 0.5)",
  },
  STARFIELD: {
    WHITE: "#ffffff",
    BLUE: "#dde6f4",
    WARM: "#f3efe6",
    HERO: "#ffffff",
  },
  BULLET: {
    GRAD_BOTTOM: "#d9dee8",
    GRAD_MID: "#ffffff",
    GRAD_TOP: "#f2f5fa",
    SHADOW: "rgba(255, 255, 255, 0.7)",
    TRAIL: "rgba(255, 255, 255, 0.28)",
  },
  BULLET_UPGRADED: {
    GRAD_BOTTOM: "#ff5c5c",
    GRAD_MID: "#ffe0e0",
    GRAD_TOP: "#ff8a8a",
    SHADOW: "rgba(255, 92, 92, 0.8)",
    TRAIL: "rgba(255, 92, 92, 0.32)",
  },
  BULLET_UPGRADED_BLUE: {
    GRAD_BOTTOM: "#4fb4ff",
    GRAD_MID: "#e3f3ff",
    GRAD_TOP: "#8fd0ff",
    SHADOW: "rgba(79, 180, 255, 0.8)",
    TRAIL: "rgba(79, 180, 255, 0.32)",
  },
  ENGINE_TRAIL: {
    CORE: "rgba(255, 255, 255, ",
    MID: "rgba(214, 220, 230, ",
    OUT: "rgba(160, 168, 180, 0)",
  },
  EXPLOSION: {
    GRAD_IN: "rgba(255, 255, 255, ",
    GRAD_MID1: "rgba(240, 243, 248, ",
    GRAD_MID2: "rgba(200, 206, 216, ",
    GRAD_OUT: "rgba(160, 168, 180, 0)",
    RING: "rgba(255, 255, 255, ",
  },
  NEBULA_RED: {
    N1: "rgba(255, 92, 92, 0.08)",
    N1_OUT: "rgba(255, 92, 92, 0)",
    N2: "rgba(255, 140, 140, 0.05)",
    N2_OUT: "rgba(255, 140, 140, 0)",
    N3: "rgba(200, 70, 90, 0.07)",
    N3_OUT: "rgba(200, 70, 90, 0)",
    N4: "rgba(120, 50, 70, 0.1)",
    N4_OUT: "rgba(120, 50, 70, 0)",
  },
  NEBULA_BLUE: {
    B1: "rgba(79, 180, 255, 0.08)",
    B1_OUT: "rgba(79, 180, 255, 0)",
    B2: "rgba(140, 200, 255, 0.05)",
    B2_OUT: "rgba(140, 200, 255, 0)",
    B3: "rgba(60, 130, 200, 0.07)",
    B3_OUT: "rgba(60, 130, 200, 0)",
    B4: "rgba(40, 70, 120, 0.1)",
    B4_OUT: "rgba(40, 70, 120, 0)",
  },
  PLAYER: {
    HULL: "#f6f7fa",
    HULL_SHADE: "#c6ccd6",
    COCKPIT: "#15171d",
    OUTLINE: "#0a0b0f",
    SHADOW: "#000",
  },
  STAR: {
    BASE: "#ffffff",
    GRAD_IN: "#ffffff",
    GRAD_MID: "#f3f5f9",
    GRAD_OUT: "#d9dee8",
    OUTLINE: "#0a0b0f",
    GLOW: "rgba(255, 255, 255, 0.4)",
  },
  STAR_RED: {
    BASE: "#ff5c5c",
    GRAD_IN: "#ffd6d6",
    GRAD_MID: "#ff5c5c",
    GRAD_OUT: "#d94848",
    OUTLINE: "#0a0b0f",
    GLOW: "rgba(255, 92, 92, 0.5)",
  },
  STAR_BLUE: {
    BASE: "#4fb4ff",
    GRAD_IN: "#dcf1ff",
    GRAD_MID: "#4fb4ff",
    GRAD_OUT: "#3f98de",
    OUTLINE: "#0a0b0f",
    GLOW: "rgba(79, 180, 255, 0.5)",
  },
  UI: {
    OVERLAY_BACKDROP: "rgba(0,0,0,0.5)",
    OVERLAY_TEXT: "#fff",
  },
  SCORE: { POPUP: "#ffffff", POPUP_STROKE: "rgba(0, 0, 0, 0.85)" },
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
      PUFF_COLOR: "rgba(214, 220, 230, 0.9)",
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
    SIZE_MIN: 0.9,
    SIZE_MAX: 2.4,
    DRAW_SIZE_MULT: 1.8,
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
