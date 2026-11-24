import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────
// Math
// ─────────────────────────────────────────────────────────────

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Frame-rate independent exponential smoothing (higher lambda = snappier). */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

/** Like damp(), but takes the shortest way around the circle. */
export const dampAngle = (current: number, target: number, lambda: number, dt: number): number =>
  current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt))

// ─────────────────────────────────────────────────────────────
// Deterministic randomness (same world on every load)
// ─────────────────────────────────────────────────────────────

export function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─────────────────────────────────────────────────────────────
// Disposal
// ─────────────────────────────────────────────────────────────

interface DisposableNode {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material | THREE.Material[]
  isSprite?: boolean
  isInstancedMesh?: boolean
  dispose?: () => void
}

function disposeMaterial(material: THREE.Material): void {
  if (material.userData.shared) return
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    const tex = value as THREE.Texture | null
    if (tex && tex.isTexture && !tex.userData.shared) tex.dispose()
  }
  material.dispose()
}

/**
 * Frees GPU resources of an object tree and detaches it from its parent.
 * Anything flagged `userData.shared = true` (cached geometries / materials /
 * textures) is left alone so other objects keep working.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse(obj => {
    const o = obj as unknown as DisposableNode
    if (o.geometry && !o.isSprite && !o.geometry.userData.shared) o.geometry.dispose()
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) disposeMaterial(m)
    }
    if (o.isInstancedMesh && o.dispose) o.dispose()
  })
  root.parent?.remove(root)
}

// ─────────────────────────────────────────────────────────────
// Cheap fake lights: additive glow sprites / ground decals
// (Replaces dozens of PointLights – every extra dynamic light multiplies
//  the cost of every lit pixel and can exceed GPU uniform limits.)
// ─────────────────────────────────────────────────────────────

let glowTexture: THREE.CanvasTexture | null = null
let unitPlane: THREE.PlaneGeometry | null = null

export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.3, 'rgba(255,255,255,0.4)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
  }
  glowTexture = new THREE.CanvasTexture(canvas)
  glowTexture.colorSpace = THREE.SRGBColorSpace
  glowTexture.userData.shared = true
  return glowTexture
}

export function createGlowSprite(
  color: THREE.ColorRepresentation,
  size: number,
  opacity = 0.8,
  fog = true
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(size, size, 1)
  return sprite
}

/** Flat glowing disc lying on the ground – a fake "light pool". */
export function createGroundGlow(
  color: THREE.ColorRepresentation,
  radius: number,
  opacity = 0.35
): THREE.Mesh {
  if (!unitPlane) {
    unitPlane = new THREE.PlaneGeometry(1, 1)
    unitPlane.userData.shared = true
  }
  const material = new THREE.MeshBasicMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  const mesh = new THREE.Mesh(unitPlane, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.scale.set(radius * 2, radius * 2, 1)
  return mesh
}

