import * as THREE from 'three'
import { WORLD } from './constants.js'
import { clamp, createGlowSprite, damp, disposeObject, mulberry32 } from './utils.js'

// ─────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────

export interface SpaceshipOptions {
  /** Same seed → same flight paths on every load. */
  seed?: number
  /** Half-size of the airspace on X/Z. Defaults to the drivable world + margin. */
  bounds?: number
  /** Min / max cruising altitude. */
  altitude?: [number, number]
  /** Min / max speed in world units per second. */
  speed?: [number, number]
}

const DEFAULT_BOUNDS = WORLD.HALF_SIZE + 80
const DEFAULT_ALTITUDE: [number, number] = [45, 130]
const DEFAULT_SPEED: [number, number] = [35, 80]
const MIN_ALTITUDE = 30
const MAX_DELTA = 0.1
const ACCENTS = [0x00ffff, 0xff00ff, 0x00ff88, 0xffaa00]

// ─────────────────────────────────────────────────────────────
// Shared resources (one copy for the whole fleet)
// ─────────────────────────────────────────────────────────────

interface ShipResources {
  body: THREE.ConeGeometry
  cockpit: THREE.SphereGeometry
  wing: THREE.BoxGeometry
  engine: THREE.CylinderGeometry
  strip: THREE.BoxGeometry
  exhaust: THREE.ConeGeometry
  bodyMat: THREE.MeshStandardMaterial
  wingMat: THREE.MeshStandardMaterial
  cockpitMat: THREE.MeshStandardMaterial
  engineMat: THREE.MeshStandardMaterial
}

interface AccentMaterials {
  strip: THREE.MeshStandardMaterial
  exhaust: THREE.MeshBasicMaterial
}

let resources: ShipResources | null = null
const accentCache = new Map<number, AccentMaterials>()

function getResources(): ShipResources {
  if (resources) return resources
  const res: ShipResources = {
    // Cones point along +Y; rotate once so the nose points along +Z (the forward axis).
    body: new THREE.ConeGeometry(0.3, 2, 6).rotateX(Math.PI / 2),
    cockpit: new THREE.SphereGeometry(0.2, 10, 10),
    wing: new THREE.BoxGeometry(1.5, 0.05, 0.6),
    engine: new THREE.CylinderGeometry(0.15, 0.25, 0.3, 8).rotateX(Math.PI / 2),
    strip: new THREE.BoxGeometry(0.02, 0.02, 1.8),
    // Open cone, tip pointing backwards (-Z): the exhaust plume.
    exhaust: new THREE.ConeGeometry(0.2, 4, 8, 1, true).rotateX(-Math.PI / 2),
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.9, roughness: 0.2 }),
    wingMat: new THREE.MeshStandardMaterial({ color: 0x2a2a3e, metalness: 0.8, roughness: 0.3 }),
    // `transmission` removed: it forces an extra full-scene render pass.
    cockpitMat: new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.6,
      roughness: 0.05,
      metalness: 0.9,
      transparent: true,
      opacity: 0.85
    }),
    engineMat: new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 2 })
  }
  for (const item of Object.values(res)) item.userData.shared = true
  resources = res
  return res
}

function getAccent(color: number): AccentMaterials {
  let mats = accentCache.get(color)
  if (mats) return mats
  mats = {
    strip: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3 }),
    exhaust: new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  }
  mats.strip.userData.shared = true
  mats.exhaust.userData.shared = true
  accentCache.set(color, mats)
  return mats
}

// ─────────────────────────────────────────────────────────────
// Spaceship
// ─────────────────────────────────────────────────────────────

/**
 * A single ship that crosses the sky and respawns at the edge of the airspace.
 * Local forward axis is +Z.
 */
export class Spaceship {
  public readonly group = new THREE.Group()
  /** World-space velocity (units / second). */
  public readonly velocity = new THREE.Vector3()

  private readonly rng: () => number
  private readonly bounds: number
  private readonly altitude: [number, number]
  private readonly speedRange: [number, number]

  private heading = 0
  private speed = 0
  private bank = 0
  private phase = 0
  private time = 0

  constructor(options: SpaceshipOptions = {}, index = 0) {
    this.rng = mulberry32((options.seed ?? 7) + index * 7919)
    this.bounds = options.bounds ?? DEFAULT_BOUNDS
    this.altitude = options.altitude ?? DEFAULT_ALTITUDE
    this.speedRange = options.speed ?? DEFAULT_SPEED

    // Yaw first, then pitch, then roll – so banking never skews the heading.
    this.group.rotation.order = 'YXZ'
    this.build(ACCENTS[index % ACCENTS.length])
    this.respawn(true)
  }

  public update(delta: number): void {
    const dt = clamp(delta, 0, MAX_DELTA)
    this.time += dt

    // Gentle weaving: the ship turns slowly and leans into the turn.
    const turn = Math.sin(this.time * 0.45 + this.phase) * 0.12 // rad / s
    this.heading += turn * dt
    this.bank = damp(this.bank, -turn * 4, 3, dt)

    const climb = Math.sin(this.time * 0.3 + this.phase * 1.3) * 4
    this.velocity.set(Math.sin(this.heading) * this.speed, climb, Math.cos(this.heading) * this.speed)

    const pos = this.group.position
    pos.addScaledVector(this.velocity, dt)
    pos.y = clamp(pos.y, MIN_ALTITUDE, this.altitude[1] + 40)

    this.applyOrientation()

    const limit = this.bounds + 30
    if (Math.abs(pos.x) > limit || Math.abs(pos.z) > limit) this.respawn()
  }

  public dispose(): void {
    disposeObject(this.group)
  }

  // ── Internals ───────────────────────────────────────────────

  private applyOrientation(): void {
    this.group.rotation.y = this.heading
    // Rotation about +X tilts the nose DOWN, so climbing needs a negative angle.
    this.group.rotation.x = -Math.atan2(this.velocity.y, this.speed)
    this.group.rotation.z = this.bank
  }

  /** Enter from a random edge, aimed at a point over the play area so ships actually cross it. */
  private respawn(initial = false): void {
    const rng = this.rng
    const B = this.bounds
    const along = (rng() * 2 - 1) * B
    const y = this.altitude[0] + rng() * (this.altitude[1] - this.altitude[0])

    let x: number
    let z: number
    switch (Math.floor(rng() * 4)) {
      case 0:
        x = -B
        z = along
        break
      case 1:
        x = B
        z = along
        break
      case 2:
        x = along
        z = -B
        break
      default:
        x = along
        z = B
    }

    const targetX = (rng() * 2 - 1) * 200
    const targetZ = (rng() * 2 - 1) * 200
    this.heading = Math.atan2(targetX - x, targetZ - z)
    this.speed = this.speedRange[0] + rng() * (this.speedRange[1] - this.speedRange[0])
    this.phase = rng() * Math.PI * 2
    this.time = 0
    this.bank = 0
    this.velocity.set(Math.sin(this.heading) * this.speed, 0, Math.cos(this.heading) * this.speed)

    // On the very first spawn, scatter ships along their path so the sky isn't empty.
    if (initial) {
      const t = rng() * ((2 * B) / this.speed) * 0.8
      x += this.velocity.x * t
      z += this.velocity.z * t
    }

    this.group.position.set(x, y, z)
    this.group.scale.setScalar(0.8 + rng() * 0.9)
    this.applyOrientation()
  }

  private build(accentColor: number): void {
    const res = getResources()
    const accent = getAccent(accentColor)

    this.group.add(new THREE.Mesh(res.body, res.bodyMat))

    const cockpit = new THREE.Mesh(res.cockpit, res.cockpitMat)
    cockpit.position.set(0, 0.05, 0.5)
    this.group.add(cockpit)

    const wings = new THREE.Mesh(res.wing, res.wingMat)
    wings.position.set(0, 0, -0.2)
    this.group.add(wings)

    const engine = new THREE.Mesh(res.engine, res.engineMat)
    engine.position.set(0, 0, -1.1)
    this.group.add(engine)

    for (const x of [-0.4, 0.4]) {
      const strip = new THREE.Mesh(res.strip, accent.strip)
      strip.position.set(x, 0, 0)
      this.group.add(strip)
    }

    // Exhaust plume + glow sprite replace the old per-ship PointLight.
    const plume = new THREE.Mesh(res.exhaust, accent.exhaust)
    plume.position.set(0, 0, -1.25 - 2)
    this.group.add(plume)

    const glow = createGlowSprite(accentColor, 3, 0.85)
    glow.position.set(0, 0, -1.3)
    this.group.add(glow)
  }
}

// ─────────────────────────────────────────────────────────────
// Traffic
// ─────────────────────────────────────────────────────────────

/** A fleet that is updated and disposed as one unit. */
export class SpaceshipTraffic {
  public readonly group = new THREE.Group()
  public readonly ships: Spaceship[] = []

  constructor(scene?: THREE.Scene, count = 4, options: SpaceshipOptions = {}) {
    for (let i = 0; i < count; i++) {
      const ship = new Spaceship(options, i)
      this.ships.push(ship)
      this.group.add(ship.group)
    }
    scene?.add(this.group)
  }

  public update(delta: number): void {
    for (const ship of this.ships) ship.update(delta)
  }

  public dispose(): void {
    disposeObject(this.group)
    this.ships.length = 0
  }
}

/** Legacy helper – prefer `new SpaceshipTraffic(scene, count)`. */
export function createSpaceshipTraffic(
  scene: THREE.Scene,
  count = 4,
  options: SpaceshipOptions = {}
): Spaceship[] {
  return new SpaceshipTraffic(scene, count, options).ships
}

