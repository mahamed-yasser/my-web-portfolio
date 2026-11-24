import * as THREE from 'three'
import type { ClearZone, Collider } from './types.js'
import { RAMP_LAYOUT, WORLD } from './constants.js'
import { clamp, createGlowSprite, disposeObject, hashString, mulberry32 } from './utils.js'

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

export type WorldThemeName = 'moon' | 'neon'
export type WorldQuality = 'low' | 'medium' | 'high'

export interface WorldOptions {
  /** `moon` = grey regolith + planets, `neon` = dark reflective synthwave floor. */
  theme?: WorldThemeName
  /** Scales particle / star / rock counts and the shadow-map size. */
  quality?: WorldQuality
  /** Same seed → same world on every load. */
  seed?: number
  /** Override the theme default. Needs a renderer (or `renderer.shadowMap.enabled = true`). */
  shadows?: boolean
  camera?: THREE.PerspectiveCamera
  renderer?: THREE.WebGLRenderer
  /** Areas that procedural props (rocks) must avoid. Defaults to spawn + ramps. */
  keepClear?: readonly ClearZone[]
}

/** Spawn point + every ramp – nothing procedural should block these. */
export function getDefaultClearZones(): ClearZone[] {
  return [{ x: 0, z: 0, r: 20 }, ...RAMP_LAYOUT.map(r => ({ x: r.x, z: r.z, r: 14 }))]
}

// ─────────────────────────────────────────────────────────────
// Theme presets
// ─────────────────────────────────────────────────────────────

interface ThemeConfig {
  background: number
  fogDensity: number
  ambient: { color: number; intensity: number }
  hemisphere: { sky: number; ground: number; intensity: number }
  sun: { color: number; intensity: number; position: THREE.Vector3Tuple }
  ground: { size: number; color: number; roughness: number; metalness: number }
  grid: { accentEvery: number; opacity: number }
  stars: number
  nebula: {
    count: number
    radius: [number, number]
    y: [number, number]
    opacity: [number, number]
  }
  particles: number
  dust: number
  rocks: number
  planets: boolean
  sunDisc: { position: THREE.Vector3Tuple; radius: number }
  shadows: boolean
}

/** Grid cell size in world units (both themes). */
const GRID_CELL = 5
const SHADOW_EXTENT = 120
const PARTICLE_RANGE = 300
const PARTICLE_TOP = 80

const THEMES: Record<WorldThemeName, ThemeConfig> = {
  moon: {
    background: 0x050510,
    fogDensity: 0.003,
    ambient: { color: 0xc6c8e0, intensity: 0.46 },
    hemisphere: { sky: 0x6688cc, ground: 0x1a1a2e, intensity: 0.42 },
    sun: { color: 0xffeedd, intensity: 1.05, position: [-100, 80, -150] },
    ground: { size: 2000, color: 0x2a2a35, roughness: 0.95, metalness: 0.05 },
    grid: { accentEvery: 10, opacity: 0.6 },
    stars: 5000,
    nebula: { count: 20, radius: [60, 180], y: [100, 300], opacity: [0.06, 0.14] },
    particles: 1000,
    dust: 2000,
    rocks: 40,
    planets: true,
    sunDisc: { position: [-250, 80, -450], radius: 55 },
    shadows: true
  },
  neon: {
    background: 0x09071b,
    fogDensity: 0.008,
    ambient: { color: 0x443451, intensity: 0.44 },
    hemisphere: { sky: 0x4a0080, ground: 0x0a0014, intensity: 0.34 },
    sun: { color: 0xff8652, intensity: 0.88, position: [100, 80, -100] },
    // Wide enough to sit under the mountain ring (radius ≈ 460–560).
    ground: { size: 1400, color: 0x0a0014, roughness: 0.38, metalness: 0.58 },
    grid: { accentEvery: 5, opacity: 0.8 },
    stars: 3000,
    nebula: { count: 12, radius: [40, 100], y: [60, 180], opacity: [0.1, 0.14] },
    particles: 500,
    dust: 0,
    rocks: 0,
    planets: false,
    sunDisc: { position: [250, 70, -400], radius: 45 },
    shadows: false
  }
}

const QUALITY_SCALE: Record<WorldQuality, number> = { low: 0.35, medium: 0.7, high: 1 }
const SHADOW_MAP_SIZE: Record<WorldQuality, number> = { low: 1024, medium: 2048, high: 2048 }

// ─────────────────────────────────────────────────────────────
// Shared textures
// ─────────────────────────────────────────────────────────────

let horizonTexture: THREE.CanvasTexture | null = null
let sunTexture: THREE.CanvasTexture | null = null

/** Vertical fade: opaque at the bottom (horizon) → transparent at the top. */
function getHorizonTexture(): THREE.CanvasTexture {
  if (horizonTexture) return horizonTexture
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,1)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 128)
  }
  horizonTexture = new THREE.CanvasTexture(canvas)
  horizonTexture.colorSpace = THREE.SRGBColorSpace
  horizonTexture.userData.shared = true
  return horizonTexture
}

/** The classic retro sun: vertical gradient with horizontal slits in the lower half. */
function getSunTexture(): THREE.CanvasTexture {
  if (sunTexture) return sunTexture
  const S = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, S)
    g.addColorStop(0, '#fff27a')
    g.addColorStop(0.5, '#ff9a3c')
    g.addColorStop(1, '#ff2d95')
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(0, S * 0.52 + i * S * 0.068, S, 4 + i * 5)
    }
  }
  sunTexture = new THREE.CanvasTexture(canvas)
  sunTexture.colorSpace = THREE.SRGBColorSpace
  sunTexture.userData.shared = true
  return sunTexture
}

/** Low-poly boulder: shared vertices get the same jitter, so there are no cracks. */
function createRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const h = hashString(`${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`)
    const k = 0.78 + ((h % 1000) / 1000) * 0.4
    pos.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k)
  }
  geo.computeVertexNormals()
  return geo
}

// ─────────────────────────────────────────────────────────────
// World
// ─────────────────────────────────────────────────────────────

/**
 * Sky, lighting, terrain and atmosphere. Everything lives under `group`, so
 * `dispose()` removes it cleanly. The sky dome follows the player, which keeps
 * the stars / planets / sun infinitely far away (no parallax, no clipping).
 *
 * ```ts
 * const world = new SynthwaveWorld(scene, { theme: 'moon', renderer, camera }).init()
 * // every frame:
 * world.update(clock.elapsedTime, delta, car.position)
 * ```
 */
export class SynthwaveWorld {
  public readonly group = new THREE.Group()
  /** Circle colliders for the procedural rocks (empty in the neon theme). */
  public readonly colliders: Collider[] = []

  private readonly scene: THREE.Scene
  private readonly theme: ThemeConfig
  private readonly quality: WorldQuality
  private readonly rng: () => number
  private readonly keepClear: readonly ClearZone[]
  private readonly shadows: boolean
  private readonly sky = new THREE.Group()
  private readonly shadowOffset = new THREE.Vector3()

  private sunLight!: THREE.DirectionalLight
  private starField!: THREE.Points
  private particleField!: THREE.Points
  private dustField?: THREE.Points
  private horizon: Array<{ material: THREE.MeshBasicMaterial; base: number }> = []
  private planets: Array<{ group: THREE.Group; baseY: number }> = []

  private initialised = false
  private lastTime: number | null = null
  private previousBackground: THREE.Scene['background'] = null
  private previousFog: THREE.Scene['fog'] = null

  constructor(scene: THREE.Scene, options?: WorldOptions)
  /** Legacy signature – still supported. */
  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    options?: WorldOptions
  )
  constructor(
    scene: THREE.Scene,
    a?: WorldOptions | THREE.PerspectiveCamera,
    b?: THREE.WebGLRenderer,
    c?: WorldOptions
  ) {
    const legacy = a instanceof THREE.PerspectiveCamera
    const options: WorldOptions = (legacy ? c : (a as WorldOptions | undefined)) ?? {}
    const camera = legacy ? a : options.camera
    const renderer = legacy ? b : options.renderer

    this.scene = scene
    this.theme = THEMES[options.theme ?? 'moon']
    this.quality = options.quality ?? 'high'
    this.rng = mulberry32(options.seed ?? 1337)
    this.keepClear = options.keepClear ?? getDefaultClearZones()
    this.shadows = options.shadows ?? this.theme.shadows

    // The sky dome is ~900 units wide – the default far plane (usually 1000) is too tight.
    if (camera && camera.far < WORLD.CAMERA_FAR) {
      camera.far = WORLD.CAMERA_FAR
      camera.updateProjectionMatrix()
    }
    if (renderer && this.shadows) {
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }
  }

  // ── Public API ──────────────────────────────────────────────

  public get stars(): THREE.Points {
    return this.starField
  }

  public get particles(): THREE.Points {
    return this.particleField
  }

  public init(): this {
    if (this.initialised) return this
    this.initialised = true

    this.setupAtmosphere()
    this.setupLighting()
    this.createStarfield()
    this.createNebulae()
    this.createGround()
    this.createGrid()
    this.createParticles()
    this.createDust()
    this.createHorizonGlow()
    this.createPlanets()
    this.createSun()
    this.createRocks()

    this.group.add(this.sky)
    this.scene.add(this.group)
    return this
  }

  /**
   * @param time   elapsed seconds
   * @param delta  frame time in seconds (derived from `time` when omitted)
   * @param focus  player position – sky + shadows follow it
   */
  public update(time: number, delta?: number, focus?: THREE.Vector3): void {
    if (!this.initialised) return
    const dt = clamp(delta ?? (this.lastTime === null ? 0 : time - this.lastTime), 0, 0.1)
    this.lastTime = time

    if (focus) {
      this.sky.position.set(focus.x, 0, focus.z)
      this.followWithSun(focus)
    }

    this.starField.rotation.y = time * 0.005
    this.updateParticles(dt)
    if (this.dustField) this.dustField.rotation.y = time * 0.002

    for (const layer of this.horizon) {
      layer.material.opacity = layer.base * (1 + Math.sin(time * 1.5) * 0.25)
    }
    this.planets.forEach((p, i) => {
      p.group.position.y = p.baseY + Math.sin(time * 0.3 + i * 1.7) * 3 // bounded bob
      p.group.rotation.y += dt * 0.12
    })
  }

  public dispose(): void {
    if (!this.initialised) return
    this.initialised = false
    disposeObject(this.group)
    this.scene.background = this.previousBackground
    this.scene.fog = this.previousFog
    this.colliders.length = 0
    this.horizon.length = 0
    this.planets.length = 0
  }

  // ── Setup ───────────────────────────────────────────────────

  private count(n: number): number {
    return Math.max(0, Math.round(n * QUALITY_SCALE[this.quality]))
  }

  private setupAtmosphere(): void {
    this.previousBackground = this.scene.background
    this.previousFog = this.scene.fog
    this.scene.background = new THREE.Color(this.theme.background)
    this.scene.fog = new THREE.FogExp2(this.theme.background, this.theme.fogDensity)
  }

  private setupLighting(): void {
    const t = this.theme
    this.group.add(
      new THREE.AmbientLight(t.ambient.color, t.ambient.intensity),
      new THREE.HemisphereLight(t.hemisphere.sky, t.hemisphere.ground, t.hemisphere.intensity)
    )

    const rimCyan = new THREE.DirectionalLight(0x00d9ef, 0.62)
    rimCyan.position.set(-60, 40, -60)
    const rimMagenta = new THREE.DirectionalLight(0xd65eff, 0.48)
    rimMagenta.position.set(60, 40, 60)
    this.group.add(rimCyan, rimMagenta)

    const sun = new THREE.DirectionalLight(t.sun.color, t.sun.intensity)
    this.shadowOffset.set(...t.sun.position)
    sun.position.copy(this.shadowOffset)
    if (this.shadows) {
      const size = SHADOW_MAP_SIZE[this.quality]
      sun.castShadow = true
      sun.shadow.mapSize.set(size, size)
      const cam = sun.shadow.camera
      cam.near = 1
      cam.far = 500
      cam.left = cam.bottom = -SHADOW_EXTENT
      cam.right = cam.top = SHADOW_EXTENT
      sun.shadow.bias = -0.0005
      sun.shadow.normalBias = 0.05
    }
    this.sunLight = sun
    this.group.add(sun, sun.target)
  }

  /** The shadow frustum follows the player, snapped to texels to avoid shimmering. */
  private followWithSun(focus: THREE.Vector3): void {
    const step = (SHADOW_EXTENT * 2) / SHADOW_MAP_SIZE[this.quality]
    const fx = Math.round(focus.x / step) * step
    const fz = Math.round(focus.z / step) * step
    this.sunLight.target.position.set(fx, 0, fz)
    this.sunLight.position.set(fx + this.shadowOffset.x, this.shadowOffset.y, fz + this.shadowOffset.z)
  }

  private createStarfield(): void {
    const count = this.count(this.theme.stars)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const rng = this.rng

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const radius = WORLD.SKY_RADIUS * (0.6 + rng() * 0.5)
      const theta = rng() * Math.PI * 2
      const cosPhi = rng() // upper hemisphere only – the rest is hidden by the ground
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
      positions[i3] = radius * sinPhi * Math.cos(theta)
      positions[i3 + 1] = radius * cosPhi
      positions[i3 + 2] = radius * sinPhi * Math.sin(theta)

      const pick = rng()
      const [r, g, b] =
        pick < 0.4 ? [1, 1, 1] : pick < 0.6 ? [0.7, 0.85, 1] : pick < 0.8 ? [1, 0.7, 0.85] : [0.5, 1, 1]
      colors[i3] = r
      colors[i3 + 1] = g
      colors[i3 + 2] = b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.starField = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 1.8,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false // the sky must not be swallowed by the ground fog
      })
    )
    this.sky.add(this.starField)
  }

  private createNebulae(): void {
    const n = this.theme.nebula
    const rng = this.rng
    const geometry = new THREE.SphereGeometry(1, 16, 10)
    const spread = WORLD.SKY_RADIUS * 0.7

    for (let i = 0; i < this.count(n.count); i++) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.7 + rng() * 0.3, 0.9, 0.3),
        transparent: true,
        opacity: n.opacity[0] + rng() * (n.opacity[1] - n.opacity[0]),
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
      const cloud = new THREE.Mesh(geometry, material)
      const radius = n.radius[0] + rng() * (n.radius[1] - n.radius[0])
      cloud.scale.set(radius, radius * 0.35, radius)
      cloud.position.set(
        (rng() - 0.5) * 2 * spread,
        n.y[0] + rng() * (n.y[1] - n.y[0]),
        (rng() - 0.5) * 2 * spread
      )
      this.sky.add(cloud)
    }
  }

  private createGround(): void {
    const g = this.theme.ground
    const groundMaterial = new THREE.MeshStandardMaterial({ color: g.color, roughness: g.roughness, metalness: g.metalness })
    groundMaterial.userData.worldRole = 'ground'
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(g.size, g.size), groundMaterial)
    ground.userData.worldRole = 'ground'
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.1
    ground.receiveShadow = true
    this.group.add(ground)
  }

  private createGrid(): void {
    const { size } = this.theme.ground
    const { accentEvery, opacity } = this.theme.grid
    const half = size / 2
    const lines = Math.round(size / GRID_CELL)
    const positions: number[] = []
    const colors: number[] = []

    const addLine = (x1: number, z1: number, x2: number, z2: number, y: number, rgb: [number, number, number]) => {
      positions.push(x1, y, z1, x2, y, z2)
      colors.push(...rgb, ...rgb)
    }

    // Whole-length lines (the old version drew one-cell stubs and no real grid).
    for (let i = 0; i <= lines; i++) {
      const p = -half + i * GRID_CELL
      addLine(p, -half, p, half, 0, [0, 0.9, 1])
      addLine(-half, p, half, p, 0, [0, 0.9, 1])
      if (i % accentEvery === 0) {
        addLine(p, -half, p, half, 0.03, [1, 0, 0.9])
        addLine(-half, p, half, p, 0.03, [1, 0, 0.9])
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const gridMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    gridMaterial.userData.worldRole = 'grid'
    const grid = new THREE.LineSegments(geometry, gridMaterial)
    grid.userData.worldRole = 'grid'
    this.group.add(grid)
  }

  private createParticles(): void {
    const count = this.count(this.theme.particles)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const rng = this.rng

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      positions[i3] = (rng() - 0.5) * 2 * PARTICLE_RANGE
      positions[i3 + 1] = 2 + rng() * (PARTICLE_TOP - 2)
      positions[i3 + 2] = (rng() - 0.5) * 2 * PARTICLE_RANGE
      const pick = rng()
      const [r, g, b] = pick < 0.33 ? [0, 1, 1] : pick < 0.66 ? [1, 0, 1] : [0, 1, 0.6]
      colors[i3] = r
      colors[i3 + 1] = g
      colors[i3 + 2] = b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.particleField = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.8,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        depthWrite: false
      })
    )
    this.particleField.frustumCulled = false
    this.group.add(this.particleField)
  }

  /** Particles rise at a fixed speed per second (the old code was frame-rate dependent). */
  private updateParticles(dt: number): void {
    const attr = this.particleField.geometry.getAttribute('position') as THREE.BufferAttribute
    const array = attr.array as Float32Array
    const rise = 3 * dt
    for (let i = 1; i < array.length; i += 3) {
      let y = array[i] + rise
      if (y > PARTICLE_TOP) y = 2
      array[i] = y
    }
    attr.needsUpdate = true
  }

  private createDust(): void {
    const count = this.count(this.theme.dust)
    if (count === 0) return
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const rng = this.rng
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      positions[i3] = (rng() - 0.5) * 700
      positions[i3 + 1] = 1 + rng() * 60
      positions[i3 + 2] = (rng() - 0.5) * 700
      const brightness = 0.5 + rng() * 0.3
      colors[i3] = colors[i3 + 1] = brightness * 0.8
      colors[i3 + 2] = brightness
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.dustField = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.4,
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        depthWrite: false
      })
    )
    this.dustField.frustumCulled = false
    this.group.add(this.dustField)
  }

  /** A 360° horizon band (the old flat planes were visible from one side only). */
  private createHorizonGlow(): void {
    const layers: Array<{ color: number; radius: number; height: number; opacity: number }> = [
      { color: 0xff00ff, radius: WORLD.SKY_RADIUS * 0.85, height: 70, opacity: 0.5 },
      { color: 0x00ffff, radius: WORLD.SKY_RADIUS * 0.83, height: 40, opacity: 0.28 }
    ]
    for (const l of layers) {
      const material = new THREE.MeshBasicMaterial({
        color: l.color,
        map: getHorizonTexture(),
        transparent: true,
        opacity: l.opacity,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
      const band = new THREE.Mesh(new THREE.CylinderGeometry(l.radius, l.radius, l.height, 64, 1, true), material)
      band.position.y = l.height / 2 - 5
      this.sky.add(band)
      this.horizon.push({ material, base: l.opacity })
    }
  }

  private createPlanets(): void {
    if (!this.theme.planets) return

    const make = (position: THREE.Vector3Tuple, build: (g: THREE.Group) => void) => {
      const group = new THREE.Group()
      build(group)
      group.position.set(...position)
      this.sky.add(group)
      this.planets.push({ group, baseY: position[1] })
    }

    // Ringed gas giant
    make([-150, 180, -400], g => {
      g.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(25, 32, 32),
          new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff4400,
            emissiveIntensity: 0.3,
            roughness: 0.8,
            metalness: 0.2,
            fog: false
          })
        )
      )
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(35, 55, 64),
        new THREE.MeshBasicMaterial({
          color: 0xffaa00,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          fog: false
        })
      )
      ring.rotation.x = Math.PI / 3
      g.add(ring)
    })

    // Small blue planet
    make([200, 220, -350], g => {
      g.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(12, 32, 32),
          new THREE.MeshStandardMaterial({
            color: 0x0088ff,
            emissive: 0x0044aa,
            emissiveIntensity: 0.4,
            roughness: 0.3,
            metalness: 0.6,
            fog: false
          })
        )
      )
    })

    // Distant purple haze
    make([100, 250, -500], g => {
      g.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(40, 24, 24),
          new THREE.MeshBasicMaterial({
            color: 0x8800ff,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
          })
        )
      )
    })
  }

  private createSun(): void {
    const { position, radius } = this.theme.sunDisc

    const glow = createGlowSprite(0xff7a2a, radius * 5.5, 0.35, false)
    glow.position.set(...position)

    const disc = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getSunTexture(), transparent: true, depthWrite: false, fog: false })
    )
    disc.scale.set(radius * 2, radius * 2, 1)
    disc.position.set(...position)

    this.sky.add(glow, disc)
  }

  private createRocks(): void {
    const count = this.count(this.theme.rocks)
    if (count === 0) return
    const rng = this.rng

    const mesh = new THREE.InstancedMesh(
      createRockGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.95, metalness: 0.1, flatShading: true }),
      count
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false // instance bounds are not tracked

    const dummy = new THREE.Object3D()
    let placed = 0
    for (let i = 0; i < count; i++) {
      let x = 0
      let z = 0
      let size = 0
      let ok = false
      for (let attempt = 0; attempt < 12 && !ok; attempt++) {
        const angle = rng() * Math.PI * 2
        const dist = 80 + rng() * 500
        x = Math.cos(angle) * dist
        z = Math.sin(angle) * dist
        size = 3 + rng() * 12
        ok = !this.keepClear.some(c => Math.hypot(x - c.x, z - c.z) < c.r + size)
      }
      if (!ok) continue

      dummy.position.set(x, size * 0.3, z)
      dummy.rotation.set(0, rng() * Math.PI * 2, 0)
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      mesh.setMatrixAt(placed++, dummy.matrix)
      this.colliders.push({ x, z, r: size * 0.9, h: size * 1.1 })
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    this.group.add(mesh)
  }
}

