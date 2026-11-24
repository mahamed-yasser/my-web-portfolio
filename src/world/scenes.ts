import * as THREE from 'three'
import { SynthwaveWorld, type WorldOptions } from './synthwave-world.js'

/**
 * Backwards-compatible wrapper around {@link SynthwaveWorld} (neon theme).
 *
 * This file used to contain a second, near-identical copy of the whole world
 * (lights, stars, grid, nebulae, mountains…). It now delegates, so there is a
 * single implementation to maintain. New code should use `SynthwaveWorld`
 * (or `createSynthwaveEnvironment`) directly.
 */
export class SynthwaveScene {
  private readonly scene: THREE.Scene
  private readonly world: SynthwaveWorld

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    options: WorldOptions = {}
  ) {
    this.scene = scene
    this.world = new SynthwaveWorld(scene, camera, renderer, { ...options, theme: options.theme ?? 'neon' })
  }

  public init(): this {
    this.world.init()
    return this
  }

  /** `time` = elapsed seconds. Pass `focus` (player position) to keep the sky centred on it. */
  public update(time: number, delta?: number, focus?: THREE.Vector3): void {
    this.world.update(time, delta, focus)
  }

  public getScene(): THREE.Scene {
    return this.scene
  }

  public dispose(): void {
    this.world.dispose()
  }
}

