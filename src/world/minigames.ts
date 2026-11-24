import * as THREE from 'three'
import type { RampSample, RampSurface } from './types.js'
import { RAMP_LAYOUT, RING_LAYOUT } from './constants.js'
import { createGlowSprite, createGroundGlow, disposeObject } from './utils.js'

// ─────────────────────────────────────────────────────────────
// Ramp
// ─────────────────────────────────────────────────────────────

const RAMP = {
  WIDTH: 6,
  LENGTH: 12,
  THICKNESS: 0.3,
  /** Incline in radians (~17°). */
  PITCH: 0.3
} as const

interface RampResources {
  deckGeo: THREE.BoxGeometry
  deckMat: THREE.MeshStandardMaterial
  sideGeo: THREE.BoxGeometry
  crossGeo: THREE.BoxGeometry
  chevronGeo: THREE.PlaneGeometry
  pillarGeo: THREE.CylinderGeometry
  pillarMat: THREE.MeshStandardMaterial
}

let rampResources: RampResources | null = null
let chevronTexture: THREE.CanvasTexture | null = null

function getChevronTexture(): THREE.CanvasTexture {
  if (chevronTexture) return chevronTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 16
    ctx.lineJoin = 'miter'
    // Two chevrons per tile, pointing up (= uphill once laid on the deck).
    for (const y of [100, 228]) {
      ctx.beginPath()
      ctx.moveTo(18, y)
      ctx.lineTo(64, y - 46)
      ctx.lineTo(110, y)
      ctx.stroke()
    }
  }
  chevronTexture = new THREE.CanvasTexture(canvas)
  chevronTexture.wrapT = THREE.RepeatWrapping
  chevronTexture.repeat.set(1, 2)
  chevronTexture.colorSpace = THREE.SRGBColorSpace
  chevronTexture.userData.shared = true
  return chevronTexture
}

function getRampResources(): RampResources {
  if (rampResources) return rampResources
  const { WIDTH: W, LENGTH: L, THICKNESS: T } = RAMP
  const res: RampResources = {
    deckGeo: new THREE.BoxGeometry(W, T, L),
    deckMat: new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.8, roughness: 0.3 }),
    sideGeo: new THREE.BoxGeometry(0.08, 0.08, L),
    crossGeo: new THREE.BoxGeometry(W + 0.08, 0.08, 0.08),
    chevronGeo: new THREE.PlaneGeometry(W - 0.8, L - 1.2),
    pillarGeo: new THREE.CylinderGeometry(0.28, 0.28, 1, 8),
    pillarMat: new THREE.MeshStandardMaterial({ color: 0x2a2a3e, metalness: 0.9, roughness: 0.2 })
  }
  for (const item of Object.values(res)) item.userData.shared = true
  rampResources = res
  return res
}

/**
 * A drivable ramp. The geometry and the car physics share ONE analytic
 * surface (`sample()`), so what you see is exactly what you drive on.
 *
 * (Old bug: the mesh used rotation.x = -0.3, which actually rises toward +Z,
 *  while the car assumed it rose toward -Z → the car hovered at the wrong end.)
 */
export class NeonRamp implements RampSurface {
  public readonly group = new THREE.Group()
  public readonly position: THREE.Vector3 = this.group.position
  public readonly rampMesh: THREE.Mesh
  public readonly yaw: number
  public readonly slope: number = RAMP.PITCH

  private readonly halfRun = (RAMP.LENGTH / 2) * Math.cos(RAMP.PITCH)
  private readonly tanPitch = Math.tan(RAMP.PITCH)
  private readonly phase = Math.random() * Math.PI * 2
  private edgeMaterial!: THREE.MeshStandardMaterial

  constructor(x: number, z: number, color: number = 0x00ffff, yaw: number = 0) {
    this.yaw = yaw
    this.group.position.set(x, 0, z)
    this.group.rotation.y = yaw
    this.rampMesh = this.build(color)
  }

  /** Surface height / slope under a world X/Z point, or null if off the ramp. */
  public sample(x: number, z: number): RampSample | null {
    const dx = x - this.position.x
    const dz = z - this.position.z
    if (dx * dx + dz * dz > 100) return null // quick reject (ramp radius ≈ 6.7)

    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    const lx = dx * c - dz * s // world → ramp-local
    const lz = dx * s + dz * c
    if (Math.abs(lx) > RAMP.WIDTH / 2 + 0.2 || Math.abs(lz) > this.halfRun) return null

    return {
      height: this.tanPitch * (this.halfRun - lz), // 0 at the low end, rises toward -Z
      slope: this.slope,
      uphillX: -s,
      uphillZ: -c
    }
  }

  public update(time: number): void {
    this.edgeMaterial.emissiveIntensity = 3.5 + Math.sin(time * 3 + this.phase) * 1.2
  }

  public dispose(): void {
    disposeObject(this.group)
  }

  private build(color: number): THREE.Mesh {
    const { WIDTH: W, LENGTH: L, THICKNESS: T, PITCH: P } = RAMP
    const res = getRampResources()
    const c = new THREE.Color(color)

    // Place the deck so its LOW end touches the ground exactly.
    const centerY = this.tanPitch * this.halfRun - T / (2 * Math.cos(P))
    const deck = new THREE.Group()
    deck.position.set(0, centerY, 0)
    deck.rotation.x = P // positive → rises toward -Z
    this.group.add(deck)

    const deckMesh = new THREE.Mesh(res.deckGeo, res.deckMat)
    deckMesh.castShadow = true
    deckMesh.receiveShadow = true
    deck.add(deckMesh)

    // Glowing edges (deck-local coordinates, so they always sit on the surface)
    this.edgeMaterial = new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 4
    })
    for (const x of [-W / 2, W / 2]) {
      const side = new THREE.Mesh(res.sideGeo, this.edgeMaterial)
      side.position.set(x, T / 2, 0)
      deck.add(side)
    }
    for (const z of [-L / 2, L / 2]) {
      const cross = new THREE.Mesh(res.crossGeo, this.edgeMaterial)
      cross.position.set(0, T / 2, z)
      deck.add(cross)
    }

    // Animated chevrons showing the driving direction
    const chevrons = new THREE.Mesh(
      res.chevronGeo,
      new THREE.MeshBasicMaterial({
        map: getChevronTexture(),
        color: c,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    chevrons.rotation.x = -Math.PI / 2
    chevrons.position.set(0, T / 2 + 0.02, 0)
    deck.add(chevrons)

    // Pillars sized to the real deck height (they used to poke through the deck)
    for (const z of [-3.5, 0, 3.5]) {
      const underside = this.tanPitch * (this.halfRun - z) - T / Math.cos(P)
      if (underside < 0.2) continue
      for (const x of [-2.4, 2.4]) {
        const pillar = new THREE.Mesh(res.pillarGeo, res.pillarMat)
        pillar.scale.y = underside
        pillar.position.set(x, underside / 2, z)
        pillar.castShadow = true
        this.group.add(pillar)
      }
    }

    // Fake light pool instead of a PointLight
    const pool = createGroundGlow(c, 10, 0.4)
    pool.position.y = 0.04
    this.group.add(pool)

    return deckMesh
  }
}

// ─────────────────────────────────────────────────────────────
// Ring
// ─────────────────────────────────────────────────────────────

let ringGeo: THREE.TorusGeometry | null = null
let innerRingGeo: THREE.TorusGeometry | null = null

const COLLECT_DURATION = 0.5

export class NeonRing {
  public readonly group = new THREE.Group()
  public readonly position: THREE.Vector3 = this.group.position
  public readonly baseY: number
  public collected = false
  // A generous pickup radius makes rings reliable at normal driving speed.
  public readonly collectRadius = 5

  private bobTime = Math.random() * Math.PI * 2
  private collectT = -1
  private readonly ringMat: THREE.MeshStandardMaterial
  private readonly innerMat: THREE.MeshStandardMaterial
  private readonly glow: THREE.Sprite

  constructor(x: number, y: number, z: number, color: number = 0xff00ff) {
    this.baseY = y
    const c = new THREE.Color(color)

    if (!ringGeo || !innerRingGeo) {
      ringGeo = new THREE.TorusGeometry(3, 0.15, 16, 32)
      innerRingGeo = new THREE.TorusGeometry(2.5, 0.05, 8, 32)
      ringGeo.userData.shared = true
      innerRingGeo.userData.shared = true
    }

    this.ringMat = new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 5,
      transparent: true,
      opacity: 0.9
    })
    this.innerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: c,
      emissiveIntensity: 3,
      transparent: true,
      opacity: 0.5
    })
    this.group.add(new THREE.Mesh(ringGeo, this.ringMat), new THREE.Mesh(innerRingGeo, this.innerMat))

    // Fake light (sprite) instead of a PointLight
    this.glow = createGlowSprite(c, 11, 0.5)
    this.group.add(this.glow)

    this.group.position.set(x, y, z)
  }

  public update(delta: number): void {
    if (this.collectT >= 0) {
      this.collectT += delta
      const t = Math.min(this.collectT / COLLECT_DURATION, 1)
      this.group.scale.setScalar(1 + t * 1.6)
      this.ringMat.opacity = 0.9 * (1 - t)
      this.innerMat.opacity = 0.5 * (1 - t)
      this.glow.material.opacity = 0.5 * (1 - t)
      if (t >= 1) {
        this.group.visible = false
        this.collectT = -1
      }
      return
    }
    if (this.collected) return

    this.bobTime += delta * 2
    this.group.position.y = this.baseY + Math.sin(this.bobTime) * 0.5
    this.group.rotation.y += delta * 0.4
    this.group.rotation.x = Math.sin(this.bobTime * 0.5) * 0.1
  }

  public contains(point: THREE.Vector3): boolean {
    return !this.collected && this.group.position.distanceToSquared(point) <= this.collectRadius ** 2
  }

  /** Marks the ring collected and plays the pop animation. Returns false if already collected. */
  public collect(): boolean {
    if (this.collected) return false
    this.collected = true
    this.collectT = 0
    return true
  }

  public reset(): void {
    this.collected = false
    this.collectT = -1
    this.group.visible = true
    this.group.scale.setScalar(1)
    this.ringMat.opacity = 0.9
    this.innerMat.opacity = 0.5
    this.glow.material.opacity = 0.5
  }

  public dispose(): void {
    disposeObject(this.group)
  }
}

// ─────────────────────────────────────────────────────────────
// Field (everything together)
// ─────────────────────────────────────────────────────────────

export interface RingCollectEvent {
  ring: NeonRing
  index: number
  /** Stable id ("ring-0" …) – use it for persistent achievements. */
  id: string
}

export const ringId = (index: number): string => `ring-${index}`

export class MiniGameField {
  public readonly group = new THREE.Group()
  public readonly ramps: NeonRamp[] = []
  public readonly rings: NeonRing[] = []
  private time = 0

  constructor(scene?: THREE.Scene) {
    for (const p of RAMP_LAYOUT) {
      const ramp = new NeonRamp(p.x, p.z, p.color, p.yaw ?? 0)
      this.ramps.push(ramp)
      this.group.add(ramp.group)
    }
    for (const p of RING_LAYOUT) {
      const ring = new NeonRing(p.x, p.y, p.z, p.color)
      this.rings.push(ring)
      this.group.add(ring.group)
    }
    scene?.add(this.group)
  }

  public get totalRings(): number {
    return this.rings.length
  }

  public get collectedRings(): number {
    return this.rings.reduce((n, r) => n + (r.collected ? 1 : 0), 0)
  }

  public update(delta: number): void {
    this.time += delta
    for (const ramp of this.ramps) ramp.update(this.time)
    for (const ring of this.rings) ring.update(delta)
    getChevronTexture().offset.y -= delta * 0.8 // chevrons flow uphill
  }

  /** Collects every ring within reach of `point`. Returns how many were collected. */
  public collectRings(point: THREE.Vector3, onCollect?: (event: RingCollectEvent) => void): number {
    let count = 0
    this.rings.forEach((ring, index) => {
      if (ring.contains(point) && ring.collect()) {
        count++
        onCollect?.({ ring, index, id: ringId(index) })
      }
    })
    return count
  }

  public resetRings(): void {
    for (const ring of this.rings) ring.reset()
  }

  public dispose(): void {
    disposeObject(this.group)
  }
}

/** Legacy helper – prefer `new MiniGameField(scene)`. */
export function createMiniGameElements(scene: THREE.Scene) {
  const field = new MiniGameField(scene)
  return { ramps: field.ramps, rings: field.rings, field }
}

