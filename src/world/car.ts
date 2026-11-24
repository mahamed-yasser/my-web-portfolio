import * as THREE from 'three'
import type { CarControls, RampSample, RampSurface } from './types.js'
import { WORLD } from './constants.js'
import { clamp, createGlowSprite, damp, disposeObject, wrapAngle } from './utils.js'

export type { CarControls } from './types.js'

export interface HoverCarOptions {
  bodyColor?: number
  detailColor?: number
  neonColor?: number
  thrusterColor?: number
  maxSpeed?: number
  boostMaxSpeed?: number
  worldBound?: number
  /** Real point lights (front + underglow). Turn off on weak GPUs. */
  dynamicLights?: boolean
}

/** Physics values were tuned at 60 FPS, so dt is normalised to this. */
const REFERENCE_FPS = 60
/** Clamp dt so tab-switching / lag spikes don't teleport the car. */
const MAX_DELTA = 1 / 20
const GRAVITY = 28
const MIN_JUMP_AIRTIME = 0.4
const BASE_HOVER = 0.7
const RAMP_CLEARANCE = 0.8
/** Lowest the car body may sit above the surface (keeps it out of the deck). */
const MIN_CLEARANCE = 0.45

export class FuturisticHoverCar {
  /** Root object: world position + yaw only. Add this to the scene. */
  public readonly group = new THREE.Group()
  /** Same reference as group.position. */
  public readonly position: THREE.Vector3 = this.group.position
  public velocity = 0
  public angle = 0
  public verticalVelocity = 0
  /** Total horizontal distance driven (world units). */
  public distanceTraveled = 0

  /** Fired on landing after a real jump (airTime in seconds). */
  public onJump?: (airTime: number) => void
  public onLand?: (impactSpeed: number) => void
  /** Fired when boost is pressed while moving. */
  public onBoost?: () => void

  // Visual body (pitch / roll / bobbing) – separate from the physics root
  private readonly body = new THREE.Group()

  private readonly bodyColor: number
  private readonly detailColor: number
  private readonly neonColor: number
  private readonly thrusterColor: number
  private readonly dynamicLights: boolean

  // Tuning
  private readonly MAX_SPEED: number
  private readonly BOOST_MAX: number
  private readonly WORLD_BOUND: number
  private readonly ACCELERATION = 0.035
  private readonly BRAKE_FORCE = 0.07
  private readonly FRICTION = 0.94
  private readonly TURN_RATE = 0.048
  private readonly BOB_AMPLITUDE = 0.05

  // State
  private ramps: readonly RampSurface[] = []
  private lastSample: RampSample | null = null
  private grounded = true
  private airTime = 0
  private groundHeight = 0
  private hoverTime = 0
  private pitch = 0
  private roll = 0
  private rampTilt = 0
  private impact = 0
  private boostFactor = 0
  private speedRatio = 0
  private lightingScale = 1
  private targetLightingScale = 1
  private wasBoosting = false
  private wasJumping = false

  // Animated parts
  private frontLight?: THREE.PointLight
  private underglowLight?: THREE.PointLight
  private rearGlow!: THREE.Sprite
  private thrusterGlowMaterial?: THREE.MeshStandardMaterial
  private shadow!: THREE.Mesh

  private readonly _forward = new THREE.Vector3()

  constructor(options: HoverCarOptions = {}) {
    this.bodyColor = options.bodyColor ?? 0xf0a50b
    this.detailColor = options.detailColor ?? 0xe94560
    this.neonColor = options.neonColor ?? 0xf0a50b
    this.thrusterColor = options.thrusterColor ?? 0xffaa00
    this.MAX_SPEED = options.maxSpeed ?? 1.2
    this.BOOST_MAX = options.boostMaxSpeed ?? 2.2
    this.WORLD_BOUND = options.worldBound ?? WORLD.HALF_SIZE
    this.dynamicLights = options.dynamicLights ?? true

    this.group.add(this.body)
    this.build()
    this.group.position.set(0, BASE_HOVER, 0)
  }

  // ───────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────

  /** Approximate speed for HUDs. */
  public get speedKmh(): number {
    return Math.abs(this.velocity) * REFERENCE_FPS * 3.6 * 0.5
  }

  public get isAirborne(): boolean {
    return !this.grounded
  }

  public get isOnRamp(): boolean {
    return this.grounded && this.lastSample !== null
  }

  /** Unit vector the car faces (reused instance – clone if you keep it). */
  public get forwardVector(): THREE.Vector3 {
    return this._forward.set(Math.sin(this.angle), 0, Math.cos(this.angle))
  }

  /** Surfaces the car can drive on / launch from. Call once (or when they change). */
  public setRamps(ramps: readonly RampSurface[]): void {
    this.ramps = ramps
  }

  /** Smoothly adapt vehicle glow and local lights to the active world style. */
  public setLightingScale(scale: number): void {
    this.targetLightingScale = clamp(scale, 0.4, 1)
  }

  /**
   * @deprecated Ramps are now processed inside update(). This only stores the
   * list so old call sites keep working without double-stepping the physics.
   */
  public handleRampCollisions(ramps: readonly RampSurface[], _delta?: number): void {
    this.ramps = ramps
  }

  public update(delta: number, controls: CarControls): void {
    const dt = Math.min(delta, MAX_DELTA)
    const k = dt * REFERENCE_FPS // 1.0 at 60 FPS

    this.hoverTime += dt * 4.5

    if (controls.reset) this.reset()

    if (controls.jump && !this.wasJumping) this.tryJump()
    this.wasJumping = !!controls.jump

    this.updateBoostEvent(controls)
    this.updateVelocity(k, controls)
    this.updateSteering(k, controls)
    this.updateMovement(k)
    this.updateVertical(dt)
    this.updateVisuals(dt, controls)
  }

  /** Start a jump whenever the car is grounded, independent of its drive speed. */
  private tryJump(): void {
    if (!this.grounded) return
    this.grounded = false
    this.airTime = 0
    this.verticalVelocity = 9
    this.lastSample = null
  }

  /** Teleport back to the origin and clear all motion state. */
  public reset(): void {
    this.group.position.set(0, BASE_HOVER, 0)
    this.velocity = 0
    this.verticalVelocity = 0
    this.angle = 0
    this.pitch = 0
    this.roll = 0
    this.rampTilt = 0
    this.impact = 0
    this.boostFactor = 0
    this.airTime = 0
    this.grounded = true
    this.wasJumping = false
    this.lastSample = null
    this.group.rotation.set(0, 0, 0)
    this.body.rotation.set(0, 0, 0)
  }

  /** Free GPU memory and detach from the scene. */
  public dispose(): void {
    disposeObject(this.group)
    this.thrusterGlowMaterial = undefined
  }

  // ───────────────────────────────────────────────────────────
  // Model
  // ───────────────────────────────────────────────────────────

  private emissive(color: number, intensity: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity })
  }

  private build(): void {
    this.buildChassis()
    this.buildHood()
    this.buildCabin()
    this.buildLights()
    this.buildThrusters()
    this.buildSideStrips()
    this.buildShadow()
  }

  private buildChassis(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: this.bodyColor,
      metalness: 0.58,
      roughness: 0.36
    })

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 3.8), mat)
    chassis.castShadow = true
    chassis.receiveShadow = true
    this.body.add(chassis)

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.6), mat)
    spoiler.position.set(0, 0.62, -1.6)
    spoiler.rotation.x = 0.2
    spoiler.castShadow = true
    this.body.add(spoiler)

    const strutGeo = new THREE.BoxGeometry(0.08, 0.4, 0.1)
    const struts = new THREE.InstancedMesh(strutGeo, mat, 2)
    const strutTransform = new THREE.Object3D()
    for (const [index, x] of [-0.7, 0.7].entries()) {
      strutTransform.position.set(x, 0.4, -1.6)
      strutTransform.updateMatrix()
      struts.setMatrixAt(index, strutTransform.matrix)
    }
    struts.instanceMatrix.needsUpdate = true
    this.body.add(struts)
  }

  private buildHood(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: this.detailColor,
      metalness: 0.68,
      roughness: 0.3
    })
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 1.6), mat)
    hood.position.set(0, 0.08, 1.1)
    hood.rotation.x = -0.1
    hood.castShadow = true
    this.body.add(hood)
  }

  private buildCabin(): void {
    // `transmission` removed: it forces an extra full-scene render pass.
    // Transmission and clearcoat are not used on this dark tinted canopy.
    // Standard shading matches its existing finish without a separate
    // physical-material shader program.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x050814,
      roughness: 0.18,
      metalness: 0.55,
      transparent: true,
      opacity: 0.85
    })
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.42, 1.8), mat)
    cabin.position.set(0, 0.38, -0.2)
    cabin.rotation.x = -0.2
    this.body.add(cabin)
  }

  private buildLights(): void {
    const headlight = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 0.05),
      this.emissive(this.neonColor, 2)
    )
    headlight.position.set(0, 0.05, 1.91)
    this.body.add(headlight)

    const taillight = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.1, 0.05),
      this.emissive(this.detailColor, 2.2)
    )
    taillight.position.set(0, 0.12, -1.91)
    this.body.add(taillight)

    // Rear light is a glow sprite (free); front + underglow are real lights.
    this.rearGlow = createGlowSprite(this.detailColor, 2, 0.7)
    this.rearGlow.position.set(0, 0.12, -2.1)
    this.body.add(this.rearGlow)

    if (this.dynamicLights) {
      this.frontLight = new THREE.PointLight(this.neonColor, 1.15, 5)
      this.frontLight.position.set(0, 0.1, 2.2)
      this.body.add(this.frontLight)

      this.underglowLight = new THREE.PointLight(this.neonColor, 1.25, 3.5)
      this.underglowLight.position.set(0, -0.4, 0)
      this.body.add(this.underglowLight)
    }
  }

  private buildThrusters(): void {
    const positions: Array<[number, number, number]> = [
      [-0.85, -0.18, 1.1],
      [0.85, -0.18, 1.1],
      [-0.85, -0.18, -1.1],
      [0.85, -0.18, -1.1]
    ]

    const ringGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.2, 16)
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a24,
      metalness: 0.8,
      roughness: 0.3
    })
    const glowGeo = new THREE.CylinderGeometry(0.26, 0.1, 0.12, 16)
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: this.thrusterColor,
      emissive: this.thrusterColor,
      emissiveIntensity: 2.4,
      transparent: true,
      opacity: 0.9
    })
    const ringInstances = new THREE.InstancedMesh(ringGeo, ringMat, positions.length)
    const glowInstances = new THREE.InstancedMesh(glowGeo, glowMaterial, positions.length)
    const thrusterTransform = new THREE.Object3D()

    positions.forEach(([x, y, z], index) => {
      // Cylinder axes are already Y (pointing at the ground).
      thrusterTransform.position.set(x, y, z)
      thrusterTransform.updateMatrix()
      ringInstances.setMatrixAt(index, thrusterTransform.matrix)
      thrusterTransform.position.y = y - 0.08
      thrusterTransform.updateMatrix()
      glowInstances.setMatrixAt(index, thrusterTransform.matrix)
    })
    ringInstances.instanceMatrix.needsUpdate = true
    glowInstances.instanceMatrix.needsUpdate = true
    this.thrusterGlowMaterial = glowMaterial
    this.body.add(ringInstances, glowInstances)
  }

  private buildSideStrips(): void {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 3.6)
    const mat = this.emissive(this.neonColor, 4)
    const left = new THREE.Mesh(geo, mat) // +X is the car's left when facing +Z
    left.position.set(0.98, 0, 0)
    const right = new THREE.Mesh(geo, mat)
    right.position.set(-0.98, 0, 0)
    this.body.add(left, right)
  }

  private buildShadow(): void {
    // Lives on the yaw-only root so it never tilts with the body.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 32),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
      })
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.scale.set(0.75, 1.5, 1)
    this.shadow.renderOrder = -1
    this.group.add(this.shadow)
  }

  // ───────────────────────────────────────────────────────────
  // Physics
  // ───────────────────────────────────────────────────────────

  private updateBoostEvent(c: CarControls): void {
    const boosting = !!c.boost
    if (boosting && !this.wasBoosting && Math.abs(this.velocity) > 0.1) this.onBoost?.()
    this.wasBoosting = boosting
  }

  private updateVelocity(k: number, c: CarControls): void {
    const maxSpeed = c.boost ? this.BOOST_MAX : this.MAX_SPEED
    const control = this.grounded ? 1 : 0.35 // little thrust control in the air
    const accel = this.ACCELERATION * k * control
    const friction = this.grounded ? this.FRICTION : 0.997

    const throttle = clamp(c.throttle ?? (c.forward && !c.backward ? 1 : c.backward && !c.forward ? -1 : 0), -1, 1)
    if (throttle > 0) {
      if (this.velocity > maxSpeed) {
        // Boost released above normal top speed: ease down instead of snapping.
        this.velocity = Math.max(maxSpeed, this.velocity * Math.pow(this.FRICTION, k))
      } else {
        this.velocity = Math.min(this.velocity + accel * throttle, maxSpeed)
      }
    } else if (throttle < 0) {
      const factor = this.velocity > 0 ? 1.8 : 1 // brake harder when reversing from forward
      this.velocity = Math.max(this.velocity - accel * Math.abs(throttle) * factor, -maxSpeed * 0.4)
    } else {
      this.velocity *= Math.pow(friction, k)
    }

    if (c.brake && this.grounded) this.velocity *= Math.pow(1 - this.BRAKE_FORCE, k)
    if (Math.abs(this.velocity) < 0.0005) this.velocity = 0
  }

  private updateSteering(k: number, c: CarControls): void {
    if (Math.abs(this.velocity) <= 0.015) return

    const authority = clamp(Math.abs(this.velocity) / (this.MAX_SPEED * 0.3), 0.35, 1)
    const turn = this.TURN_RATE * authority * Math.sign(this.velocity) * k

    const steering = clamp(c.steering ?? (c.left && !c.right ? 1 : c.right && !c.left ? -1 : 0), -1, 1)
    this.angle += turn * steering
    this.angle = wrapAngle(this.angle) // bounded: no float drift over long sessions
  }

  private updateMovement(k: number): void {
    const step = this.velocity * k
    this.distanceTraveled += Math.abs(step)
    this.position.x += Math.sin(this.angle) * step
    this.position.z += Math.cos(this.angle) * step

    const b = this.WORLD_BOUND
    const cx = clamp(this.position.x, -b, b)
    const cz = clamp(this.position.z, -b, b)
    if (cx !== this.position.x || cz !== this.position.z) this.velocity *= 0.9 // bleed speed on the wall
    this.position.x = cx
    this.position.z = cz
  }

  private sampleGround(x: number, z: number): RampSample | null {
    let best: RampSample | null = null
    for (const ramp of this.ramps) {
      const s = ramp.sample(x, z)
      if (s && (!best || s.height > best.height)) best = s
    }
    return best
  }

  private updateVertical(dt: number): void {
    const sample = this.sampleGround(this.position.x, this.position.z)
    const groundH = sample ? sample.height : 0
    const targetY = groundH + (sample ? RAMP_CLEARANCE : BASE_HOVER)
    this.groundHeight = groundH

    if (this.grounded) {
      // Leaving the top of a ramp at speed → launch into the air.
      const prev = this.lastSample
      if (!sample && prev && prev.height > 1.2 && this.velocity > 0.3) {
        const dot = Math.sin(this.angle) * prev.uphillX + Math.cos(this.angle) * prev.uphillZ
        if (dot > 0.5) {
          this.grounded = false
          this.airTime = 0
          this.verticalVelocity = this.velocity * REFERENCE_FPS * Math.tan(prev.slope) * dot * 0.95
        }
      }

      if (this.grounded) {
        if (sample) {
          // Stick to the deck (never sink below it, even while climbing fast).
          this.position.y = Math.max(damp(this.position.y, targetY, 25, dt), groundH + MIN_CLEARANCE)
        } else {
          this.position.y = damp(this.position.y, targetY, 6, dt)
        }
      }
    } else {
      this.verticalVelocity -= GRAVITY * dt
      this.position.y += this.verticalVelocity * dt
      this.airTime += dt

      if (this.position.y <= targetY && this.verticalVelocity <= 0) {
        const impactSpeed = -this.verticalVelocity
        this.position.y = targetY
        this.verticalVelocity = 0
        this.grounded = true
        this.impact = clamp(impactSpeed * 0.012, 0, 0.6)
        if (this.airTime >= MIN_JUMP_AIRTIME) this.onJump?.(this.airTime)
        this.onLand?.(impactSpeed)
        this.airTime = 0
      }
    }

    this.lastSample = sample
  }

  // ───────────────────────────────────────────────────────────
  // Visuals
  // ───────────────────────────────────────────────────────────

  private updateVisuals(dt: number, c: CarControls): void {
    const boosting = !!c.boost && this.velocity > this.MAX_SPEED * 0.5
    this.speedRatio = Math.min(Math.abs(this.velocity) / this.MAX_SPEED, 1.8)
    this.boostFactor = damp(this.boostFactor, boosting ? 1 : 0, 6, dt)
    this.lightingScale = damp(this.lightingScale, this.targetLightingScale, 3.5, dt)

    this.group.rotation.y = this.angle

    // Ramp pitch: nose up going up, nose down going down; follows the arc in the air.
    let targetRampPitch = 0
    if (!this.grounded) {
      const fwd = Math.max(Math.abs(this.velocity) * REFERENCE_FPS, 8)
      targetRampPitch = clamp(-Math.atan2(this.verticalVelocity, fwd) * 0.7, -0.5, 0.5)
    } else if (this.lastSample) {
      const s = this.lastSample
      const dot = Math.sin(this.angle) * s.uphillX + Math.cos(this.angle) * s.uphillZ
      targetRampPitch = -s.slope * dot
    }
    this.rampTilt = damp(this.rampTilt, targetRampPitch, 8, dt)

    const steer = (c.left ? 1 : 0) - (c.right ? 1 : 0)
    const speedFactor = Math.min(this.speedRatio, 1)
    const targetPitch = -this.speedRatio * 0.08 + this.rampTilt
    const targetRoll = -steer * 0.06 * speedFactor * (this.velocity < 0 ? -1 : 1)

    this.pitch = damp(this.pitch, targetPitch, 8, dt)
    this.roll = damp(this.roll, targetRoll, 6, dt)
    this.impact = damp(this.impact, 0, 8, dt)

    this.body.rotation.x = this.pitch
    this.body.rotation.z = this.roll
    this.body.position.y = Math.sin(this.hoverTime) * this.BOB_AMPLITUDE - this.impact

    // Neon reactions
    const pulse = 1 + Math.sin(this.hoverTime * 2) * 0.08
    const glow = (1.6 + this.speedRatio * 1.1 + this.boostFactor * 0.9) * pulse * this.lightingScale
    if (this.thrusterGlowMaterial) this.thrusterGlowMaterial.emissiveIntensity = glow

    if (this.frontLight) this.frontLight.intensity = (1.15 + this.speedRatio * 0.55) * this.lightingScale
    if (this.underglowLight) {
      this.underglowLight.intensity = (1.25 + this.speedRatio * 0.65 + this.boostFactor * 0.45) * this.lightingScale
    }
    ;(this.rearGlow.material as THREE.SpriteMaterial).opacity = 0.55 + (c.brake ? 0.4 : 0) + this.speedRatio * 0.1

    // Shadow stays on the ground (also on ramps) and fades with height.
    const height = this.position.y - this.groundHeight
    this.shadow.position.y = -height + 0.03
    const fade = clamp(1.4 - height * 0.35, 0.12, 1)
    ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade
  }
}

