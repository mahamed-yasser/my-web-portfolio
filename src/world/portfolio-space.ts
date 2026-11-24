import * as THREE from 'three'
import type { PortfolioProject } from '../data/profile.js'

const STATION_COLORS = [0x22d3ee, 0xa78bfa, 0x60a5fa, 0x34d399]
const STATION_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [94, -72], [146, -72], [120, -46], [120, -98]
]

interface ProjectStation {
  index: number
  root: THREE.Group
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>
  core: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>
  label: THREE.Sprite
  labelCanvas: HTMLCanvasElement
  labelTexture: THREE.CanvasTexture
  baseLabelY: number
}

function makeLabelTexture(text: string, color: number): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 192
  const ctx = canvas.getContext('2d')!
  const hex = `#${color.toString(16).padStart(6, '0')}`
  ctx.fillStyle = 'rgba(8, 12, 30, .94)'
  ctx.beginPath()
  ctx.roundRect(4, 4, 760, 184, 24)
  ctx.fill()
  ctx.strokeStyle = `${hex}cc`
  ctx.lineWidth = 5
  ctx.stroke()
  ctx.fillStyle = hex
  ctx.fillRect(28, 34, 6, 124)
  ctx.fillStyle = '#f8fafc'
  ctx.font = '600 43px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.direction = 'ltr'
  let title = text
  while (ctx.measureText(title).width > 650 && title.length > 12) title = `${title.slice(0, -4)}…`
  ctx.fillText(title, 58, 96, 650)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 2
  return { canvas, texture }
}

export class ProjectStations {
  public readonly targets: THREE.Object3D[] = []
  public readonly positions: THREE.Vector3[] = []
  public readonly group = new THREE.Group()
  private readonly stations: ProjectStation[] = []
  private selected = -1
  private hovered = -1
  private readonly platformInstances: THREE.InstancedMesh

  constructor(scene: THREE.Scene, projects: readonly PortfolioProject[], titleFor: (index: number) => string) {
    const platformGeometry = new THREE.CylinderGeometry(3.6, 4.2, 0.9, 12)
    const ringGeometry = new THREE.TorusGeometry(4.5, 0.12, 8, 36)
    const coreGeometry = new THREE.CylinderGeometry(1.1, 1.8, 2.5, 8)
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x11172d, metalness: 0.82, roughness: 0.28 })
    this.platformInstances = new THREE.InstancedMesh(platformGeometry, platformMaterial, projects.length)
    this.platformInstances.receiveShadow = true
    this.group.add(this.platformInstances)
    const platformTransform = new THREE.Object3D()
    projects.forEach((_, index) => {
      const color = STATION_COLORS[index % STATION_COLORS.length]
      const root = new THREE.Group()
      const [x, z] = STATION_POSITIONS[index % STATION_POSITIONS.length]
      platformTransform.position.set(x, 0.45, z)
      platformTransform.updateMatrix()
      this.platformInstances.setMatrixAt(index, platformTransform.matrix)

      const ringMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, metalness: 0.3, roughness: 0.32 })
      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.12
      ring.userData.projectIndex = index
      root.add(ring)

      const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x18233b, emissive: color, emissiveIntensity: 0.35, metalness: 0.8, roughness: 0.22 })
      const core = new THREE.Mesh(coreGeometry, coreMaterial)
      core.position.y = 2.1
      core.castShadow = true
      core.userData.projectIndex = index
      root.add(core)

      const labelData = makeLabelTexture(titleFor(index), color)
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelData.texture, transparent: true, depthWrite: false }))
      label.scale.set(9.8, 2.45, 1)
      label.position.y = 5.7
      label.userData.projectIndex = index
      root.add(label)

      root.position.set(x, 0, z)
      root.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) this.targets.push(object)
      })
      this.positions.push(new THREE.Vector3(x, 0, z))
      this.stations.push({ index, root, ring, core, label, labelCanvas: labelData.canvas, labelTexture: labelData.texture, baseLabelY: label.position.y })
      this.group.add(root)
    })
    this.platformInstances.instanceMatrix.needsUpdate = true
    this.targets.push(this.platformInstances)
    scene.add(this.group)
  }

  public projectIndexFromHit(hit: THREE.Intersection | undefined): number | undefined {
    if (!hit) return undefined
    if (hit.object === this.platformInstances) {
      return hit.instanceId !== undefined && hit.instanceId < this.stations.length ? hit.instanceId : undefined
    }
    const index = hit.object.userData.projectIndex
    return typeof index === 'number' ? index : undefined
  }

  public nearest(position: THREE.Vector3): { index: number; distance: number } | null {
    let result: { index: number; distance: number } | null = null
    for (const station of this.stations) {
      const distance = station.root.position.distanceTo(position)
      if (!result || distance < result.distance) result = { index: station.index, distance }
    }
    return result
  }

  public setSelected(index: number): void {
    this.selected = index
    this.refreshHighlights()
  }

  public setHovered(index: number): void {
    if (this.hovered === index) return
    this.hovered = index
    this.refreshHighlights()
  }

  public update(time: number): void {
    for (const station of this.stations) {
      station.ring.rotation.z = time * 0.18 + station.index * 0.45
      const active = station.index === this.selected || station.index === this.hovered
      station.core.material.emissiveIntensity = active ? 0.72 : 0.22 + Math.sin(time * 1.4 + station.index) * 0.04
      station.label.position.y = station.baseLabelY + Math.sin(time * 1.1 + station.index) * 0.14
    }
  }

  public refreshLabels(titleFor: (index: number) => string): void {
    for (const station of this.stations) {
      const ctx = station.labelCanvas.getContext('2d')!
      const color = STATION_COLORS[station.index % STATION_COLORS.length]
      const hex = `#${color.toString(16).padStart(6, '0')}`
      ctx.clearRect(0, 0, 768, 192)
      ctx.fillStyle = 'rgba(8, 12, 30, .94)'
      ctx.beginPath()
      ctx.roundRect(4, 4, 760, 184, 24)
      ctx.fill()
      ctx.strokeStyle = `${hex}cc`
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.fillStyle = hex
      ctx.fillRect(28, 34, 6, 124)
      ctx.fillStyle = '#f8fafc'
      ctx.font = '600 43px system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'
      ctx.fillText(titleFor(station.index), 58, 96, 650)
      station.labelTexture.needsUpdate = true
    }
  }

  public dispose(): void {
    this.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry?.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material.dispose())
      }
    })
    this.stations.forEach(station => station.labelTexture.dispose())
    this.group.removeFromParent()
    this.stations.length = 0
    this.targets.length = 0
    this.positions.length = 0
  }

  private refreshHighlights(): void {
    for (const station of this.stations) {
      const active = station.index === this.selected || station.index === this.hovered
      station.ring.material.emissiveIntensity = active ? 2.3 : 0.95
      station.core.material.emissiveIntensity = active ? 0.72 : 0.28
      station.root.scale.setScalar(station.index === this.hovered ? 1.045 : 1)
    }
  }
}

export interface CentralHub {
  group: THREE.Group
  avatar: THREE.Group
  update(time: number): void
}

export function createCentralHub(scene: THREE.Scene): CentralHub {
  const group = new THREE.Group()
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(14, 16, 0.3, 48),
    new THREE.MeshStandardMaterial({ color: 0x10172d, metalness: 0.62, roughness: 0.42 })
  )
  platform.position.y = -0.08
  platform.receiveShadow = true
  group.add(platform)

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(15, 0.12, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0x5268ff, transparent: true, opacity: 0.65 })
  )
  outerRing.rotation.x = Math.PI / 2
  outerRing.position.y = 0.1
  group.add(outerRing)

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(11, 0.06, 6, 72),
    new THREE.MeshBasicMaterial({ color: 0x36dcf2, transparent: true, opacity: 0.55 })
  )
  innerRing.rotation.x = Math.PI / 2
  innerRing.position.y = 0.12
  group.add(innerRing)

  const avatar = new THREE.Group()
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x211c52, emissive: 0x442caa, emissiveIntensity: 0.75, metalness: 0.38, roughness: 0.48 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x36dcf2, emissive: 0x0aaac7, emissiveIntensity: 1.1, metalness: 0.12, roughness: 0.4 })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 1.15, 4, 10), bodyMaterial)
  torso.position.y = 1.45
  torso.castShadow = true
  avatar.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 16, 12), new THREE.MeshStandardMaterial({ color: 0x171d35, emissive: 0x152b65, emissiveIntensity: 0.5, metalness: 0.42, roughness: 0.45 }))
  head.position.y = 2.75
  head.castShadow = true
  avatar.add(head)
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.18), accentMaterial)
  visor.position.set(0, 2.8, 0.48)
  avatar.add(visor)
  const shoulder = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.09, 8, 24), accentMaterial)
  shoulder.position.y = 1.95
  shoulder.rotation.x = Math.PI / 2
  avatar.add(shoulder)
  const arms: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.78, 1.95, 0)
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.55, 3, 8), bodyMaterial)
    upperArm.position.y = -0.4
    upperArm.castShadow = true
    arm.add(upperArm)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), accentMaterial)
    hand.position.y = -0.82
    arm.add(hand)
    avatar.add(arm)
    arms.push(arm)
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.75), accentMaterial)
  belt.position.y = 0.82
  avatar.add(belt)
  avatar.position.set(0, 0.15, 9)
  group.add(avatar)
  scene.add(group)

  return {
    group,
    avatar,
    update(time) {
      avatar.position.y = 0.15 + Math.sin(time * 1.1) * 0.12
      avatar.rotation.y = Math.sin(time * 0.45) * 0.12
      arms[0].rotation.z = -0.08 + Math.sin(time * 0.8) * 0.06
      arms[1].rotation.z = 0.08 + Math.sin(time * 0.8 + 0.7) * 0.06
      arms[0].rotation.x = Math.sin(time * 0.55) * 0.05
      outerRing.rotation.z = time * 0.06
      innerRing.rotation.z = -time * 0.1
    }
  }
}

