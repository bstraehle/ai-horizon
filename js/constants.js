/**
 * AI Horizon game configuration constants.
 * The exported object is deeply frozen to prevent accidental mutation at runtime.
 *
 * @constant
 * @type {Readonly<{
 *  COLORS: any,
 *  ASTEROID: any,
 *  BULLET: any,
 *  EXPLOSION: any,
 *  GAME: any,
 *  INPUT: any,
 *  NEBULA: any,
 *  PLAYER: any,
 *  SIZES: any,
 *  SPEEDS: any,
 *  STAR: any,
 *  UI: any,
 * }>} CONFIG
 */
const COLORS = deepFreeze({
  ASTEROID: {
    // More realistic rocky asteroid tones: dusty light center, mid gray-brown, dark outer rim
    CRATER: "#6b6b6b", // crater - cool gray
    GRAD_IN: "#cfc9c0", // dusty, slightly warm center
    GRAD_MID: "#8f8579", // stony gray-brown midtone
    GRAD_OUT: "#3f3a36", // dark outer rim
    OUTLINE: "#2f2b28", // deep outline for contrast
    RING: "#7a7570", // subtle ring tone matching mid/crater
  },
  // Hard/indestructible asteroid variant (darker, higher contrast outline)
  ASTEROID_HARD: {
    CRATER: "#333",
    GRAD_IN: "#333",
    GRAD_MID: "#222",
    GRAD_OUT: "#111",
    OUTLINE: "#777",
    RING: "#999",
    // Shield: shifted from blue to near-black for a harsher impact flash
    SHIELD: "#1a1a1a",
  },
  // Slightly darker than regular asteroid, used when shielded to keep core natural
  ASTEROID_DARK: {
    // Mars-like palette: rusty orange and brown tones
    CRATER: "#6B3926", // dark brown (crater)
    GRAD_IN: "#FF8C42", // bright rusty orange (center)
    GRAD_MID: "#C1440E", // burnt orange / Mars red
    GRAD_OUT: "#3C1A0E", // deep brown (outer)
    OUTLINE: "#8B3E2F", // muted reddish-brown outline
    SHIELD: "#FFBF8A", // warm orange glow for impacts
    RING: "#6B3926", // match crater color for unified look
  },
  // Monochrome "mean" indestructible asteroid palette.
  // Replaces former multi-planet color variants with a darker, high-contrast
  // look that still uses radial shading but stays within grayscale values.
  // If additional variants are desired later they can be added as an array again.
  ASTEROID_PLANETS: [
    {
      NAME: "MONO_DARK",
      // Keep crater slightly lighter than mid to preserve emboss readability
      // Slight darkening pass (2025-09-13): reduce overall brightness ~10-15%
      // while preserving relative contrast for crater emboss + damage lines.
      CRATER: "#4e4e4e", // was #5a5a5a
      GRAD_IN: "#a2a2a2", // was #b8b8b8 (inner highlight a bit dimmer)
      GRAD_MID: "#555555", // was #6a6a6a
      GRAD_OUT: "#161616", // was #1e1e1e
      OUTLINE: "#080808", // was #0c0c0c
      RING: "#383838", // was #444444
      // Shield: switched from subtle blue to charcoal for a menacing feel
      SHIELD: "#121212",
      SPEED_FACTOR: 0.55, // similar heft to prior heavier variants
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
    GRAD_IN: "rgba(255, 255, 255, ", // alpha appended
    GRAD_MID1: "rgba(255, 200, 100, ", // alpha appended
    GRAD_MID2: "rgba(255, 100, 50, ", // alpha appended
    GRAD_OUT: "rgba(255, 50, 0, 0)",
  },
  NEBULA: {
    N1: "rgba(80, 130, 255, 0.1)",
    N1_OUT: "rgba(80, 130, 255, 0)",
    N2: "rgba(255, 100, 100, 0.1)",
    N2_OUT: "rgba(255, 100, 100, 0)",
    N3: "rgba(255, 200, 100, 0.1)",
    N3_OUT: "rgba(255, 200, 100, 0)",
    N4: "rgba(180, 80, 255, 0.1)",
    N4_OUT: "rgba(180, 80, 255, 0)",
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
    // Grayer variant (requested: closer to asteroid monochrome):
    //  - Inner highlight: slightly dimmed neutral (#dcdcdc) instead of near-white.
    //  - Mid: moderate gray (#b0b0b0) for body.
    //  - Outer: darker neutral (#505050) to anchor shape (more contrast than prior #8c8c8c vs new mid).
    //  - BASE (glow) sits between inner and mid to avoid washed halos (#c4c4c4).
    //  - Keeps readability over background (#222-#444) while removing bright “white” pop.
    BASE: "#c4c4c4",
    GRAD_IN: "#dcdcdc",
    GRAD_MID: "#b0b0b0",
    GRAD_OUT: "#505050",
  },
  // Red bonus star palette
  STAR_RED: {
    // Desaturated "danger red" aligned to gray star luminance steps:
    //  Luminance mapping (approx):
    //   Gray star   : IN #dcdcdc | BASE #c4c4c4 | MID #b0b0b0 | OUT #505050
    //   Target reds : IN #d8b4b4 | BASE #b87878 | MID #9c4a4a | OUT #4a1f1f
    //  - Inner: #d8b4b4 keeps a pale warm highlight (not pure pink, slightly browned).
    //  - Base (glow): #b87878 sits between inner and mid for halo.
    //  - Mid: #9c4a4a provides central body (muted, not candy red).
    //  - Outer: #4a1f1f anchors silhouette with a deep dangerous rim.
    //  This preserves relative contrast pattern of gray stars while signaling threat via hue.
    BASE: "#b87878",
    GRAD_IN: "#d8b4b4",
    GRAD_MID: "#9c4a4a",
    GRAD_OUT: "#4a1f1f",
  },
  UI: {
    OVERLAY_BACKDROP: "rgba(0,0,0,0.5)",
    OVERLAY_TEXT: "#fff",
  },
});

export const CONFIG = deepFreeze({
  TWO_PI: Math.PI * 2,
  VIEW: {
    DPR_MIN: 1,
    DPR_MAX: 3,
    // Maximum DPR to use on mobile devices to limit canvas pixel size and improve performance
    DPR_MOBILE_MAX: 1.5,
  },
  ASTEROID: {
    HORIZONTAL_MARGIN: 40,
    MIN_SIZE: 25,
    SIZE_VARIATION: 50,
    SPAWN_Y: -40,
    // SHIELD_ENABLE: when false, indestructible asteroids do NOT render the
    // temporary impact energy ring/flash. Visual feedback relies solely on
    // craters, cracks, outline changes. Set true to re-enable the effect.
    SHIELD_ENABLE: false,
    // Size multipliers applied to regular and indestructible asteroids.
    // Regular asteroids are slightly smaller; indestructible asteroids are larger like planets.
    REGULAR_SIZE_FACTOR: 0.85,
    INDESTRUCTIBLE_SIZE_FACTOR: 1.6,
    // Indestructible asteroids move more slowly to feel massive
    INDESTRUCTIBLE_SPEED_FACTOR: 0.55,
    SPEED_VARIATION: 120,
    SHIELD_FLASH_TIME: 0.15,
    // Number of bullet hits required to destroy an indestructible asteroid
    INDESTRUCTIBLE_HITS: 10,
    SHIELD_FLASH_EXTRA_ALPHA: 0.4,
    // Crater emboss tuning (visual polish). Set ENABLE to false to skip per-frame crater shading.
    CRATER_EMBOSS: {
      ENABLE: true,
      COUNT_BASE: 3,
      COUNT_VAR: 2, // up to +2 more craters
      SIZE_MIN: 2,
      SIZE_FACTOR: 0.3, // fraction of asteroid radius for max crater radius
      LIGHT_DIR: { x: -0.7, y: -0.7 }, // normalized-ish light vector (top-left)
      HIGHLIGHT_ALPHA: 0.35,
      SHADOW_ALPHA_INNER: 0.45,
      SHADOW_ALPHA_MID: 0.25,
      // Damage layering: as indestructible asteroid takes hits, optionally add more craters
      EXTRA_MAX: 4, // maximum number of extra craters to activate over full damage range
      SHADOW_DARKEN_SCALE: 0.5, // additional multiplier up to +50% darkness at max severity
      HIGHLIGHT_FADE_SCALE: 0.4, // reduce highlight alpha by up to 40% at max severity
      REVEAL_TIME: 0.25, // seconds for a newly activated crater to reach full size
      REVEAL_EASE: "outQuad", // easing function key (currently only outQuad supported)
      // Dust puff emitted when a new crater activates (fresh impact flair)
      PUFF_ENABLE: true,
      // Visibility-tuned dust puff (slightly more particles & lifespan)
      PUFF_COUNT: 9, // was 6
      PUFF_LIFE: 0.55, // was 0.4
      PUFF_LIFE_VAR: 0.2, // was 0.15
      PUFF_SPEED: 170, // was 140
      PUFF_SPEED_VAR: 110, // was 60
      PUFF_SIZE_MIN: 1.2, // was 0.8
      PUFF_SIZE_VAR: 1.6, // was 1.2
      PUFF_COLOR: "rgba(210,200,190,0.9)", // lighter & slightly more opaque
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
    // Points awarded for destroying an indestructible asteroid
    ASTEROID_SCORE_INDESTRUCTIBLE: 100,
    // Global fallback spawn rates (kept for compatibility). Prefer the
    // platform-specific keys below when the game provides a platform hint.
    ASTEROID_SPAWN_RATE: 2.0,
    SHOT_COOLDOWN: 200,
    STARFIELD_COUNT: 150,
    // Lower starfield density on mobile to reduce per-frame work
    STARFIELD_COUNT_MOBILE: 80,
    STAR_SCORE: 20,
    STAR_SCORE_RED: 50,
    STAR_SPAWN_RATE: 1.0,
    // Platform-specific spawn rates. These increase desktop density while
    // keeping mobile rates conservative to reduce per-frame work.
    // Adjust these numbers to tune difficulty/density on each platform.
    // Slightly increased desktop spawn rates per request
    ASTEROID_SPAWN_RATE_DESKTOP: 4.0,
    ASTEROID_SPAWN_RATE_MOBILE: 1.5,
    STAR_SPAWN_RATE_DESKTOP: 2.0,
    STAR_SPAWN_RATE_MOBILE: 1.0,
    // How many yellow stars are spawned before a red bonus star appears.
    // Original behavior used 10 (so the 11th was red). Lower this to increase red star frequency.
    STAR_YELLOW_BEFORE_RED: 4,
    // How many normal asteroids are spawned before an indestructible one appears.
    // Original behavior used 10 (so the 11th was indestructible). Lower this to increase frequency.
    ASTEROID_NORMAL_BEFORE_INDESTRUCTIBLE: 4,
    // Countdown timer in seconds for time-limited runs
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
    COUNT_DESKTOP: 8,
    COUNT_MOBILE: 4,
    RADIUS_MAX_DESKTOP: 250,
    RADIUS_MAX_MOBILE: 125,
    RADIUS_MIN_DESKTOP: 100,
    RADIUS_MIN_MOBILE: 50,
    BLOB_COUNT_BASE_DESKTOP: 5,
    BLOB_COUNT_VAR_DESKTOP: 3,
    BLOB_COUNT_BASE_MOBILE: 3,
    BLOB_COUNT_VAR_MOBILE: 2,
    BLOB_MIN_FACTOR: 0.35,
    BLOB_VAR_FACTOR: 0.6,
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
    TWINKLE_RATE: 4, // radians per second
    TWINKLE_X_FACTOR: 0.01,
    SHADOW_BLUR_MULT: 2,
    // Optional layered starfield configuration. When LAYERS is defined the
    // StarField entity will generate multiple parallax layers instead of a
    // single flat array. Each layer may override base starfield properties
    // via multipliers or absolute values. Counts fall back to GAME.STARFIELD_COUNT
    // (or MOBILE variant) when omitted.
    // Order matters: layers are drawn from far -> near (array order).
    LAYERS: [
      {
        name: "far",
        countFactor: 0.4, // 40% of base count
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
    // Variation in spawned star speed (used as rng.range(0, SPEED_VARIATION))
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

/** Tau-like constant: 2π */
export const PI2 = Math.PI * 2;
/** Clamp a number between (min, max). */
/**
 * Clamp a number between (min, max).
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
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
