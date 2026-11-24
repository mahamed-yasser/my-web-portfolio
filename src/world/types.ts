/** Shared contracts used across the synthwave world modules. */

export interface CarControls {
  forward?: boolean
  backward?: boolean
  left?: boolean
  right?: boolean
  brake?: boolean
  jump?: boolean
  boost?: boolean
  reset?: boolean
  /** Normalized joystick axis: negative is reverse, positive is forward. */
  throttle?: number
  /** Normalized joystick axis: positive steers left, negative steers right. */
  steering?: number
}

/** Result of sampling a drivable surface (ramp) at a world X/Z position. */
export interface RampSample {
  /** Surface height (world Y) at the sampled point. */
  height: number
  /** Slope angle in radians. */
  slope: number
  /** Unit vector (XZ plane) pointing uphill. */
  uphillX: number
  uphillZ: number
}

/** Anything the car can drive on. NeonRamp implements this. */
export interface RampSurface {
  sample(x: number, z: number): RampSample | null
}

export interface Disposable {
  dispose(): void
}

/** Circle on the XZ plane. `h` = height of the obstacle (optional: infinite). */
export interface Collider {
  x: number
  z: number
  r: number
  h?: number
}

/** Area that procedural scenery must avoid. */
export interface ClearZone {
  x: number
  z: number
  r: number
}

