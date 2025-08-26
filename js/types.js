/**
 * Shared JSDoc types to improve checkJs across the project.
 * These are types only; there is no runtime code here.
 */

/** @typedef {{ x:number, y:number, width:number, height:number }} Rect */

/** @typedef {{ nextFloat:()=>number, range?:(min:number,max:number)=>number }} RNGLike */

/** Basic logical view size for the canvas. */
/** @typedef {{ width:number, height:number, dpr?: number }} ViewSize */

/**
 * @typedef {Object} EntityLike
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {(dtSec?:number)=>void} update
 * @property {(ctx:CanvasRenderingContext2D)=>void} draw
 * @property {()=>Rect} [getBounds]
 */

/**
 * @template T
 * @typedef {Object} Pool
 * @property {(...args:any[])=>T} acquire
 * @property {(obj:T)=>void} release
 */

/** Event payloads by event name. */
/** @typedef {{
 *   bulletHitAsteroid: { asteroid: { x:number,y:number,width:number,height:number, getBounds?:()=>Rect }, bullet: { x:number,y:number,width:number,height:number, getBounds?:()=>Rect } },
 *   playerHitAsteroid: { asteroid: { x:number,y:number,width:number,height:number, getBounds?:()=>Rect } },
 *   collectedStar: { star: { x:number,y:number,width:number,height:number, getBounds?:()=>Rect, isRed?: boolean } }
 * }} GameEventMap */
/** Event names emitted by the game. */
/** @typedef {keyof GameEventMap} GameEvent */
/** Lightweight event bus surface used by systems with typed payloads. */
/** @typedef {{
 *   emit: <K extends GameEvent>(type: K, payload: GameEventMap[K])=>void,
 *   on: <K extends GameEvent>(type: K, handler: (payload: GameEventMap[K])=>void)=>()=>void,
 *   off: <K extends GameEvent>(type: K, handler: (payload: GameEventMap[K])=>void)=>void,
 *   clear: (type?: GameEvent)=>void
 * }} EventBusish */

// Re-export common classes purely for typing via JSDoc import()
/** @typedef {import('./entities/Player.js').Player} Player */
/** @typedef {import('./entities/Bullet.js').Bullet} Bullet */
/** @typedef {import('./entities/Asteroid.js').Asteroid} Asteroid */
/** @typedef {import('./entities/Star.js').Star} Star */
/** @typedef {import('./entities/Explosion.js').Explosion} Explosion */
/** @typedef {import('./entities/Particle.js').Particle} Particle */
/** @typedef {import('./entities/EngineTrail.js').EngineTrail} EngineTrail */
/** @template T @typedef {import('./utils/ObjectPool.js').ObjectPool<T>} ObjectPoolOf */
/** @typedef {import('./core/InputState.js').InputState} InputState */
/** @typedef {import('./core/EventBus.js').EventBus} EventBus */
/** @typedef {import('./utils/RateLimiter.js').RateLimiter} RateLimiter */
/** @typedef {import('./core/GameLoop.js').GameLoop} GameLoop */
/** @typedef {import('./core/GameStateMachine.js').GameStateMachine} GameStateMachine */

/** Pre-rendered sprite atlas surfaces used by RenderManager. */
/** @typedef {{ bullet: HTMLCanvasElement, bulletTrail: number, star: HTMLCanvasElement, starRed: HTMLCanvasElement, starBaseSize: number }} SpriteAtlas */

/**
 * Main game state shape used by the orchestrator in game.js.
 * This is a documentation aid for JSDoc consumers; not all modules require every property.
 * @typedef {Object} GameState
 * @property {HTMLCanvasElement} canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {ViewSize} view
 * @property {DOMRect} [canvasRect]
 * @property {HTMLElement} gameInfo
 * @property {HTMLElement} gameOverScreen
 * @property {HTMLButtonElement} startBtn
 * @property {HTMLButtonElement} restartBtn
 * @property {HTMLElement} currentScoreEl
 * @property {HTMLElement} highScoreEl
 * @property {HTMLElement} finalScoreEl
 * @property {number} highScore
 * @property {number} score
 * @property {InputState} input
 * @property {EventBus} events
 * @property {GameStateMachine} state
 * @property {boolean} _isMobile
 * @property {number} asteroidSpeed
 * @property {number} bulletSpeed
 * @property {number} starSpeed
 * @property {RNGLike} rng
 * @property {RateLimiter} fireLimiter
 * @property {boolean} [_pausedFrameRendered]
 * @property {number} timeMs
 * @property {number} timeSec
 * @property {Player} player
 * @property {EngineTrail} engineTrail
 * @property {SpriteAtlas} sprites
 * @property {number} cellSize
 * @property {Asteroid[]} asteroids
 * @property {Bullet[]} bullets
 * @property {Explosion[]} explosions
 * @property {Particle[]} particles
 * @property {Star[]} stars
 * @property {ObjectPoolOf<Bullet>} bulletPool
 * @property {ObjectPoolOf<Particle>} particlePool
 * @property {ObjectPoolOf<Asteroid>} asteroidPool
 * @property {ObjectPoolOf<Star>} starPool
 * @property {ObjectPoolOf<Explosion>} explosionPool
 * @property {GameLoop} loop
 */

/**
 * Slice used by UpdateSystems.* functions.
 * @typedef {Object} SystemsGame
 * @property {ViewSize} view
 * @property {Player} player
 * @property {ObjectPoolOf<Bullet>} bulletPool
 * @property {ObjectPoolOf<Asteroid>} asteroidPool
 * @property {ObjectPoolOf<Star>} starPool
 * @property {ObjectPoolOf<Particle>} particlePool
 * @property {ObjectPoolOf<Explosion>} explosionPool
 * @property {EngineTrail} engineTrail
 * @property {RNGLike} rng
 * @property {GameStateMachine=} state
 * @property {Asteroid[]} asteroids
 * @property {Bullet[]} bullets
 * @property {Explosion[]} explosions
 * @property {Particle[]} particles
 * @property {Star[]} stars
 */

/**
 * Slice used by CollisionManager.check
 * @typedef {Object} CollisionGameSlice
 * @property {number} cellSize
 * @property {Asteroid[]} asteroids
 * @property {Bullet[]} bullets
 * @property {Star[]} stars
 * @property {Player} player
 * @property {ObjectPoolOf<Bullet>=} bulletPool
 * @property {ObjectPoolOf<Asteroid>=} asteroidPool
 * @property {ObjectPoolOf<Star>=} starPool
 * @property {Particle[]} particles
 * @property {ObjectPoolOf<Particle>} particlePool
 * @property {RNGLike} rng
 * @property {EventBusish=} events
 */

/**
 * Handlers expected by InputManager.setup
 * @typedef {Object} GameInputHandlers
 * @property {(e:KeyboardEvent)=>void} handleKeyDown
 * @property {(e:KeyboardEvent)=>void} handleKeyUp
 * @property {(e:KeyboardEvent)=>void} handlePauseKeyDown
 * @property {()=>void} handleResize
 * @property {(e:MouseEvent)=>void} handleMouseMove
 * @property {()=>void} handleMouseDown
 * @property {()=>void} handleMouseUp
 * @property {()=>void} handleMouseLeave
 * @property {(e:TouchEvent)=>void} handleTouchMove
 * @property {(e:TouchEvent)=>void} handleTouchStart
 * @property {(e:TouchEvent)=>void} handleTouchEnd
 * @property {()=>void} handleStartClick
 * @property {()=>void} handleRestartClick
 * @property {(e:KeyboardEvent)=>void} handleStartKeyDown
 * @property {(e:KeyboardEvent)=>void} handleRestartKeyDown
 * @property {(e:Event)=>void} handleStartScreenFocusGuard
 * @property {(e:Event)=>void} handleGameOverFocusGuard
 * @property {()=>void} handleWindowFocus
 * @property {()=>void} handleVisibilityChange
 * @property {(e:FocusEvent)=>void} handleDocumentFocusIn
 * @property {()=>void} handleScroll
 */

// Make this a module so JSDoc import('...') works without affecting runtime
export {};
