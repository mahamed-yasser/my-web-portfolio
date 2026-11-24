import * as THREE from 'three'
import type { ClearZone, Collider } from './types.js'
import { WORLD } from './constants.js'
import {
  SynthwaveWorld,
  getDefaultClearZones,
  type WorldOptions,
  type WorldQuality
} from './synthwave-world.js'
import { disposeObject, mulberry32 } from './utils.js'

// ─────────────────────────────────────────────────────────────
// Scenery: neon trees + wireframe mountains
// ─────────────────────────────────────────────────────────────

export interface SceneryOptions {
  seed?: number
  quality?: WorldQuality
  /** Areas that must stay empty (ramps, spawn point, robots…). */
  keepClear?: readonly ClearZone[]
  /** Number of trees at `high` quality. */
  treeCount?: number
  mountainCount?: number
}

const QUALITY_SCALE: Record<WorldQuality, number> = { low: 0.4, medium: 0.7, high: 1 }
const TREE_SPACING = 5
const TREE_MIN_ORIGIN_DISTANCE = 30

interface TreeSpot {
  x: number
  z: number
  scale: number
  yaw: number
}

/**
 * Procedural scenery built from a handful of InstancedMeshes (the old version
 * created ~600 meshes and ~500 materials for 100 trees).
 */
export class Scenery {
  public readonly group = new THREE.Group()
  /** Trunk colliders – the car doesn't use them yet, but gameplay code can. */
  public readonly colliders: Collider[] = []

  private readonly canopyMaterials: THREE.MeshStandardMaterial[] = []

  constructor(scene?: THREE.Scene, options: SceneryOptions = {}) {
    const rng = mulberry32(options.seed ?? 2024)
    const scale = QUALITY_SCALE[options.quality ?? 'high']
    const keepClear = options.keepClear ?? getDefaultClearZones()

    this.buildTrees(rng, Math.round((options.treeCount ?? 140) * scale), keepClear)
    this.buildMountains(rng, Math.max(8, Math.round((options.mountainCount ?? 20) * scale)))
    scene?.add(this.group)
  }

  public update(time: number): void {
    this.canopyMaterials.forEach((mat, j) => {
      mat.emissiveIntensity = 0.5 + j * 0.1 + Math.sin(time * 1.5 + j * 0.8) * 0.12
    })
  }

  public dispose(): void {
    disposeObject(this.group)
    this.colliders.length = 0
    this.canopyMaterials.length = 0
  }

  // ── Trees ───────────────────────────────────────────────────

  private pickTreeSpots(rng: () => number, count: number, keepClear: readonly ClearZone[]): TreeSpot[] {
    const limit = WORLD.HALF_SIZE - 10
    const spots: TreeSpot[] = []
    const minGap = TREE_SPACING * TREE_SPACING

    for (let attempt = 0; attempt < count * 25 && spots.length < count; attempt++) {
      const x = (rng() * 2 - 1) * limit
      const z = (rng() * 2 - 1) * limit
      if (Math.hypot(x, z) < TREE_MIN_ORIGIN_DISTANCE) continue
      if (keepClear.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) continue
      if (spots.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < minGap)) continue
      spots.push({ x, z, scale: 0.8 + rng() * 0.8, yaw: rng() * Math.PI * 2 })
    }
    return spots
  }

  private buildTrees(rng: () => number, count: number, keepClear: readonly ClearZone[]): void {
    const spots = this.pickTreeSpots(rng, count, keepClear)
    if (spots.length === 0) return
    const dummy = new THREE.Object3D()

    /** One InstancedMesh holding a single tree part for every tree. */
    const instance = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      localY: number,
      castShadow = false
    ): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(geometry, material, spots.length)
      spots.forEach((s, i) => {
        dummy.position.set(s.x, localY * s.scale, s.z)
        dummy.rotation.set(0, s.yaw, 0)
        dummy.scale.setScalar(s.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = castShadow
      mesh.frustumCulled = false // instance bounds are not tracked
      this.group.add(mesh)
      return mesh
    }

    instance(
      new THREE.CylinderGeometry(0.15, 0.25, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 0.6 }),
      1.5,
      true
    )

    for (let j = 0; j < 3; j++) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 0.5 + j * 0.1,
        flatShading: true
      })
      this.canopyMaterials.push(material)
      instance(new THREE.ConeGeometry(1.8 - j * 0.4, 2, 6), material, 4 + j * 1.2, true)
    }

    // Glowing ring on the ground (unlit, so it costs almost nothing)
    instance(
      new THREE.TorusGeometry(2, 0.06, 8, 16).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00ffff }),
      0.05
    )

    for (const s of spots) this.colliders.push({ x: s.x, z: s.z, r: 0.35 * s.scale, h: 7 * s.scale })
  }

  // ── Mountains ───────────────────────────────────────────────

  /**
   * Mountains stand OUTSIDE the drivable square (they used to sit at radius
   * 180–240 while the world was 400 wide, i.e. in the middle of the map).
   */
  private buildMountains(rng: () => number, count: number): void {
    const unitCone = new THREE.ConeGeometry(1, 1, 4)
    const solid = new THREE.InstancedMesh(
      unitCone,
      new THREE.MeshStandardMaterial({
        color: 0x1a0a3e,
        emissive: 0x4a0080,
        emissiveIntensity: 0.3,
        flatShading: true,
        fog: false
      }),
      count
    )
    solid.frustumCulled = false

    // Wire edges: merged into ONE LineSegments (instancing isn't supported for lines).
    const edges = new THREE.EdgesGeometry(unitCone)
    const edgePos = edges.getAttribute('position')
    const lines: number[] = []

    const dummy = new THREE.Object3D()
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.18
      const dist = WORLD.HALF_SIZE * 1.15 + rng() * 100
      const radius = 45 + rng() * 30
      const height = 70 + rng() * 60

      dummy.position.set(Math.cos(angle) * dist, height / 2 - 10, Math.sin(angle) * dist)
      dummy.rotation.set(0, rng() * Math.PI, 0)
      dummy.scale.set(radius, height, radius)
      dummy.updateMatrix()
      solid.setMatrixAt(i, dummy.matrix)

      for (let k = 0; k < edgePos.count; k++) {
        v.fromBufferAttribute(edgePos, k).applyMatrix4(dummy.matrix)
        lines.push(v.x, v.y, v.z)
      }
    }
    solid.instanceMatrix.needsUpdate = true
    edges.dispose()

    const wireGeometry = new THREE.BufferGeometry()
    wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
    const wire = new THREE.LineSegments(
      wireGeometry,
      new THREE.LineBasicMaterial({
        color: 0xff00ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    )
    this.group.add(solid, wire)
  }
}

// ─────────────────────────────────────────────────────────────
// Everything together
// ─────────────────────────────────────────────────────────────

export interface EnvironmentOptions extends WorldOptions {
  /** `false` = sky + terrain only. Pass an object to tune trees / mountains. */
  scenery?: boolean | Pick<SceneryOptions, 'treeCount' | 'mountainCount'>
}

export interface SynthwaveEnvironment {
  world: SynthwaveWorld
  scenery: Scenery | null
  /** Legacy fields (the old function returned `{ stars, particles }`). */
  stars: THREE.Points
  particles: THREE.Points
  colliders: Collider[]
  /** Call every frame. `focus` = player position (sky + shadows follow it). */
  update(time: number, delta?: number, focus?: THREE.Vector3): void
  dispose(): void
}

/**
 * World + scenery in one call. Defaults to the `neon` theme (the look of the
 * original function); pass `{ theme: 'moon' }` for the lunar variant.
 *
 * ```ts
 * const env = createSynthwaveEnvironment(scene, { renderer, camera })
 * // every frame
 * env.update(clock.elapsedTime, delta, car.position)
 * ```
 */
export function createSynthwaveEnvironment(
  scene: THREE.Scene,
  options: EnvironmentOptions = {}
): SynthwaveEnvironment {
  const keepClear = options.keepClear ?? getDefaultClearZones()

  const world = new SynthwaveWorld(scene, {
    ...options,
    theme: options.theme ?? 'neon',
    keepClear
  }).init()

  const sceneryOptions = typeof options.scenery === 'object' ? options.scenery : {}
  const scenery =
    options.scenery === false
      ? null
      : new Scenery(scene, { ...sceneryOptions, quality: options.quality, keepClear })

  return {
    world,
    scenery,
    stars: world.stars,
    particles: world.particles,
    colliders: [...world.colliders, ...(scenery?.colliders ?? [])],
    update(time, delta, focus) {
      world.update(time, delta, focus)
      scenery?.update(time)
    },
    dispose() {
      scenery?.dispose()
      world.dispose()
    }
  }
}

