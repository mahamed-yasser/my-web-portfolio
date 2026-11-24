/**
 * Single source of truth for world dimensions and layouts.
 * (Before, the car was clamped to ±200 while ramps/rings were placed up to
 *  ±320, so many of them were physically unreachable.)
 */
export const WORLD = {
  /** The drivable square is [-HALF_SIZE, HALF_SIZE] on X and Z. */
  HALF_SIZE: 400,
  /** Camera far plane – must reach the sky dome. */
  CAMERA_FAR: 3000,
  /** Radius of the sky dome (stars, planets, sun). */
  SKY_RADIUS: 900
} as const

export interface RampPlacement {
  x: number
  z: number
  color: number
  /** Rotation around Y. The ramp climbs toward its local -Z. */
  yaw?: number
}

export interface RingPlacement {
  x: number
  y: number
  z: number
  color: number
}

export const RAMP_LAYOUT: readonly RampPlacement[] = [
  { x: 30, z: -30, color: 0x00ffff },
  { x: -35, z: 25, color: 0xff00ff },
  { x: 45, z: 40, color: 0x00ff88 },
  { x: -50, z: -45, color: 0xffaa00 },
  { x: 150, z: -120, color: 0xff00ff },
  { x: -180, z: 140, color: 0x00ffff },
  { x: 200, z: 160, color: 0xffaa00 },
  { x: -220, z: -180, color: 0x00ff88 },
  { x: 300, z: 0, color: 0xffffff },
  { x: 0, z: -300, color: 0xff00aa }
]

export const RING_LAYOUT: readonly RingPlacement[] = [
  { x: 20, y: 8, z: -20, color: 0x00ffff },
  { x: -25, y: 10, z: -35, color: 0xff00ff },
  { x: 35, y: 12, z: 15, color: 0xffaa00 },
  { x: -40, y: 9, z: 30, color: 0x00ff88 },
  { x: 0, y: 15, z: -50, color: 0xff00aa },
  { x: -60, y: 11, z: -10, color: 0xaa00ff },
  { x: 55, y: 8, z: -55, color: 0x00aaff },
  { x: 10, y: 14, z: 50, color: 0xff5500 },
  { x: 240, y: 16, z: 220, color: 0xff00ff },
  { x: -260, y: 18, z: -200, color: 0x00ffff },
  { x: 320, y: 20, z: -280, color: 0xffaa00 },
  { x: -300, y: 14, z: 320, color: 0x00ff88 },
  { x: 180, y: 12, z: 240, color: 0xffffff },
  { x: -220, y: 10, z: -260, color: 0xff00aa }
]

export const TOTAL_RINGS = RING_LAYOUT.length

