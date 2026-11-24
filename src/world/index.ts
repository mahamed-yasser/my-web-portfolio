// Synthwave World Module – public API
//
// Typical setup:
//   const env   = createSynthwaveEnvironment(scene, { renderer, camera })
//   const car   = new FuturisticHoverCar()
//   const field = new MiniGameField(scene)
//   car.setRamps(field.ramps)
//   // per frame: car.update(dt, controls); env.update(t, dt, car.position); field.update(dt) …

// ── Shared contracts, constants, helpers ─────────────────────
export type {
  CarControls,
  ClearZone,
  Collider,
  Disposable,
  RampSample,
  RampSurface
} from './types.js'
export { WORLD, RAMP_LAYOUT, RING_LAYOUT, TOTAL_RINGS } from './constants.js'
export type { RampPlacement, RingPlacement } from './constants.js'
export * from './utils.js'

// ── World (sky, terrain, scenery) ────────────────────────────
export { SynthwaveWorld, getDefaultClearZones } from './synthwave-world.js'
export type { WorldOptions, WorldQuality, WorldThemeName } from './synthwave-world.js'
export { Scenery, createSynthwaveEnvironment } from './environment.js'
export type { EnvironmentOptions, SceneryOptions, SynthwaveEnvironment } from './environment.js'
export { SynthwaveScene } from './scenes.js'
export { Spaceship, SpaceshipTraffic, createSpaceshipTraffic } from './spaceships.js'
export type { SpaceshipOptions } from './spaceships.js'

// ── Player & gameplay ────────────────────────────────────────
export { FuturisticHoverCar } from './car.js'
export type { HoverCarOptions } from './car.js'
export { MiniGameField, NeonRamp, NeonRing, createMiniGameElements, ringId } from './minigames.js'
export type { RingCollectEvent } from './minigames.js'
export {
  ACHIEVEMENTS,
  AchievementManager,
  achievements,
  getAchievementDescription
} from './achievements.js'
export type {
  AchievementDef,
  AchievementState,
  AchievementTotals
} from './achievements.js'

