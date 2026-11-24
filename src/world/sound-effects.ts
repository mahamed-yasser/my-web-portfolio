/** Small, generated interface tones. Audio is created only after an explicit opt-in. */
export class SoundEffects {
  private context: AudioContext | null = null
  private master: GainNode | null = null

  public get isEnabled(): boolean { return this.enabled }
  public get currentVolume(): number { return this.volume }
  private enabled = false
  private volume = 0.35

  public async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    if (!enabled) return
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) { this.enabled = false; return }
    this.context ??= new AudioContextClass()
    this.master ??= this.context.createGain()
    this.master.gain.value = this.volume
    this.master.connect(this.context.destination)
    if (this.context.state === 'suspended') await this.context.resume()
  }

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context!.currentTime, 0.04)
  }

  public play(kind: 'select' | 'open' | 'preset' = 'select'): void {
    if (!this.enabled || !this.context || !this.master || this.context.state !== 'running') return
    const now = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    const start = kind === 'open' ? 440 : kind === 'preset' ? 620 : 520
    oscillator.type = kind === 'open' ? 'sine' : 'triangle'
    oscillator.frequency.setValueAtTime(start, now)
    oscillator.frequency.exponentialRampToValueAtTime(start * 1.32, now + 0.09)
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(kind === 'open' ? 0.075 : 0.045, now + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
    oscillator.connect(envelope).connect(this.master)
    oscillator.start(now)
    oscillator.stop(now + 0.16)
  }

  public dispose(): void {
    this.enabled = false
    void this.context?.close()
    this.context = null
    this.master = null
  }
}

