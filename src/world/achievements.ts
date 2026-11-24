import * as THREE from 'three'
import { TOTAL_RINGS } from './constants.js'
import { t } from '../i18n/index.js'

// ─────────────────────────────────────────────────────────────
// Types & definitions
// ─────────────────────────────────────────────────────────────

export interface AchievementTotals {
  rings: number
  zones: number
}

export interface AchievementState {
  unlocked: Set<string>
  ringsCollected: number
  zonesVisited: Set<string>
  jumpsPerformed: number
  totalDistance: number
  boostUsed: boolean
}

export interface AchievementDef {
  id: string
  name: string
  /** Static fallback text. */
  description: string
  /** Optional dynamic text that depends on the real totals. */
  describe?: (totals: AchievementTotals) => string
  icon: string
  color: string
  condition: (state: AchievementState, totals: AchievementTotals) => boolean
}

// Thresholds now depend on the REAL number of rings/zones. Before, "Collect
// all rings" required 25 while the world only had 14 → it could never unlock.
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_contact',
    name: 'First Contact',
    description: 'Visit your first zone',
    icon: '🎯',
    color: '#f0a50b',
    condition: s => s.zonesVisited.size >= 1
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Visit all zones',
    describe: t => `Visit all ${t.zones} zones`,
    icon: '🗺️',
    color: '#00f3ff',
    condition: (s, t) => t.zones > 0 && s.zonesVisited.size >= t.zones
  },
  {
    id: 'ring_collector',
    name: 'Ring Collector',
    description: 'Collect 5 rings',
    icon: '💍',
    color: '#a200ff',
    condition: s => s.ringsCollected >= 5
  },
  {
    id: 'ring_master',
    name: 'Ring Master',
    description: 'Collect most of the rings',
    describe: t => `Collect ${Math.ceil(t.rings * 0.75)} rings`,
    icon: '💎',
    color: '#ffd700',
    condition: (s, t) => s.ringsCollected >= Math.ceil(t.rings * 0.75)
  },
  {
    id: 'sky_high',
    name: 'Sky High',
    description: 'Perform your first jump',
    icon: '🚀',
    color: '#ff007f',
    condition: s => s.jumpsPerformed >= 1
  },
  {
    id: 'jump_master',
    name: 'Jump Master',
    description: 'Jump 10 times',
    icon: '⬆️',
    color: '#00ff88',
    condition: s => s.jumpsPerformed >= 10
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Use boost',
    icon: '⚡',
    color: '#ffaa00',
    condition: s => s.boostUsed
  },
  {
    id: 'nomad',
    name: 'Nomad',
    description: 'Drive 5000 units',
    icon: '🏍️',
    color: '#ff5500',
    condition: s => s.totalDistance >= 5000
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Collect all rings',
    icon: '👑',
    color: '#ffffff',
    condition: (s, t) => t.rings > 0 && s.ringsCollected >= t.rings
  }
]

export const getAchievementDescription = (def: AchievementDef, totals: AchievementTotals): string =>
  def.describe ? def.describe(totals) : def.description

// ─────────────────────────────────────────────────────────────
// Persistence (never throws – private mode / quota errors are ignored)
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'portfolio_achievements'

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

interface PersistedState {
  unlocked?: string[]
  ringsCollected?: number
  zonesVisited?: string[]
  jumpsPerformed?: number
  totalDistance?: number
  boostUsed?: boolean
  ringIds?: string[]
}

function emptyState(): AchievementState {
  return {
    unlocked: new Set(),
    ringsCollected: 0,
    zonesVisited: new Set(),
    jumpsPerformed: 0,
    totalDistance: 0,
    boostUsed: false
  }
}

// ─────────────────────────────────────────────────────────────
// Manager
// ─────────────────────────────────────────────────────────────

const NOTIFICATION_MS = 3500
const STYLE_ID = 'achievement-styles'

export class AchievementManager {
  /** Set false to disable the toast notifications (events still fire). */
  public uiEnabled = true

  private state: AchievementState = emptyState()
  private ringIds = new Set<string>()
  private totals: AchievementTotals = { rings: TOTAL_RINGS, zones: 5 }

  private unlockListeners = new Set<(def: AchievementDef) => void>()
  private changeListeners = new Set<() => void>()
  private queue: AchievementDef[] = []
  private showing = false
  private dirty = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private panel: { container: HTMLElement; content: HTMLElement } | null = null

  constructor() {
    this.load()
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.flush)
  }

  // ── Configuration ───────────────────────────────────────────

  /** Tell the manager how many rings / zones the world really has. */
  public configure(totals: Partial<AchievementTotals>): void {
    this.totals = { ...this.totals, ...totals }
    this.evaluate()
  }

  public getState(): AchievementState {
    return this.state
  }

  public getTotals(): AchievementTotals {
    return this.totals
  }

  public isUnlocked(id: string): boolean {
    return this.state.unlocked.has(id)
  }

  // ── Events ──────────────────────────────────────────────────

  /** Returns an unsubscribe function. */
  public onUnlock(cb: (def: AchievementDef) => void): () => void {
    this.unlockListeners.add(cb)
    return () => this.unlockListeners.delete(cb)
  }

  public onChange(cb: () => void): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }

  // ── Recording progress ──────────────────────────────────────

  /** Pass a stable id so the same ring never counts twice across sessions. */
  public recordRing(id?: string): boolean {
    if (id !== undefined) {
      if (this.ringIds.has(id)) return false
      this.ringIds.add(id)
    }
    this.state.ringsCollected++
    this.commit()
    return true
  }

  public recordJump(count = 1): void {
    this.state.jumpsPerformed += count
    this.commit()
  }

  public visitZone(name: string): void {
    if (this.state.zonesVisited.has(name)) return
    this.state.zonesVisited.add(name)
    this.commit()
  }

  public recordBoost(): void {
    if (this.state.boostUsed) return
    this.state.boostUsed = true
    this.commit()
  }

  public addDistance(distance: number): void {
    if (!(distance > 0)) return
    this.state.totalDistance += distance
    this.evaluate()
    this.markDirty()
  }

  public reset(): void {
    this.state = emptyState()
    this.ringIds.clear()
    this.queue.length = 0
    getStorage()?.removeItem(STORAGE_KEY)
    this.dirty = false
    this.notifyChange()
  }

  // ── UI ──────────────────────────────────────────────────────

  /**
   * Renders the achievements list into `container` (and keeps it updated).
   * `onClose` replaces the old inline `onclick="closeZone()"`, which threw a
   * ReferenceError whenever no global closeZone() existed.
   */
  public mountPanel(container: HTMLElement | null, options: { onClose?: () => void } = {}): void {
    if (!container) return
    container.replaceChildren()

    const close = el('button', 'close-btn', '✕')
    close.addEventListener('click', () => options.onClose?.())
    const title = el('h2', '', '🏆 Achievements')
    title.style.color = '#ffd700'
    const content = el('div', '', '')
    content.id = 'achievements-content'

    container.append(close, title, content)
    this.panel = { container, content }
    this.renderPanel()
  }

  public renderPanel(): void {
    if (!this.panel) return
    const { content } = this.panel
    const unlocked = ACHIEVEMENTS.filter(a => this.state.unlocked.has(a.id))
    const locked = ACHIEVEMENTS.filter(a => !this.state.unlocked.has(a.id))

    const heading = el('h3', '', `${unlocked.length} / ${ACHIEVEMENTS.length} Unlocked`)
    heading.style.cssText =
      'color:#f0a50b;font-size:0.85rem;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;'

    const card = (def: AchievementDef, won: boolean): HTMLElement => {
      const root = el('div', `achievement-card ${won ? 'won' : 'locked'}`, '')
      root.append(el('span', 'ach-icon', won ? def.icon : '🔒'))
      const info = el('div', 'ach-info', '')
      info.append(
        el('span', 'ach-name', def.name),
        el('span', 'ach-desc', getAchievementDescription(def, this.totals))
      )
      root.append(info)
      if (won) {
        const check = el('span', 'ach-check', '✓')
        check.style.color = def.color
        root.append(check)
      }
      return root
    }

    content.replaceChildren(heading, ...unlocked.map(a => card(a, true)), ...locked.map(a => card(a, false)))
  }

  public dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.flush)
    this.flush()
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.unlockListeners.clear()
    this.changeListeners.clear()
    this.queue.length = 0
    this.panel = null
  }

  // ── Internals ───────────────────────────────────────────────

  private commit(): void {
    this.evaluate()
    this.markDirty()
  }

  /** Unlocks EVERY achievement that is now satisfied (the old code stopped after the first). */
  private evaluate(): void {
    let unlockedAny = false
    for (const def of ACHIEVEMENTS) {
      if (this.state.unlocked.has(def.id)) continue
      if (!def.condition(this.state, this.totals)) continue
      this.state.unlocked.add(def.id)
      this.queue.push(def)
      unlockedAny = true
      this.unlockListeners.forEach(cb => cb(def))
    }
    if (unlockedAny) {
      this.save()
      this.notifyChange()
      this.pumpQueue()
    }
  }

  private notifyChange(): void {
    this.renderPanel()
    this.changeListeners.forEach(cb => cb())
  }

  private load(): void {
    try {
      const raw = getStorage()?.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      const p = parsed as PersistedState
      const validAchievementIds = new Set(ACHIEVEMENTS.map(item => item.id))
      const knownZones = new Set(['about', 'projects', 'skills', 'experience', 'contact'])
      const stringList = (value: unknown, allowed?: Set<string>) => Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.length <= 100 && (!allowed || allowed.has(item)))
        : []
      const count = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0
      this.state = {
        unlocked: new Set(stringList(p.unlocked, validAchievementIds)),
        ringsCollected: count(p.ringsCollected, TOTAL_RINGS),
        zonesVisited: new Set(stringList(p.zonesVisited, knownZones)),
        jumpsPerformed: count(p.jumpsPerformed, 100000),
        totalDistance: typeof p.totalDistance === 'number' && Number.isFinite(p.totalDistance) ? Math.max(0, Math.min(p.totalDistance, 1_000_000_000)) : 0,
        boostUsed: p.boostUsed === true
      }
      this.ringIds = new Set(stringList(p.ringIds).slice(0, TOTAL_RINGS))
    } catch {
      this.state = emptyState()
    }
  }

  private save(): void {
    this.dirty = false
    try {
      const s = this.state
      const data: PersistedState = {
        unlocked: [...s.unlocked],
        ringsCollected: s.ringsCollected,
        zonesVisited: [...s.zonesVisited],
        jumpsPerformed: s.jumpsPerformed,
        totalDistance: s.totalDistance,
        boostUsed: s.boostUsed,
        ringIds: [...this.ringIds]
      }
      getStorage()?.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage unavailable or full – progress simply isn't persisted */
    }
  }

  /** Debounced save so addDistance() can run every frame without hammering storage. */
  private markDirty(): void {
    this.dirty = true
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (this.dirty) this.save()
    }, 2000)
  }

  private flush = (): void => {
    if (this.dirty) this.save()
  }

  // ── Toast notifications (one at a time, queued) ─────────────

  private pumpQueue(): void {
    if (!this.uiEnabled || typeof document === 'undefined') {
      this.queue.length = 0
      return
    }
    if (this.showing) return
    const def = this.queue.shift()
    if (!def) return
    this.showing = true
    this.showToast(def, () => {
      this.showing = false
      this.pumpQueue()
    })
  }

  private showToast(def: AchievementDef, done: () => void): void {
    ensureStyles()
    document.getElementById('achievement-notification')?.remove()

    const root = el('div', 'achievement-notif', '')
    root.id = 'achievement-notification'
    root.setAttribute('role', 'status')
    root.setAttribute('aria-live', 'polite')
    root.style.borderColor = def.color
    root.style.boxShadow = `0 0 30px ${def.color}40`

    const text = el('div', 'achievement-text', '')
    const name = el('span', 'achievement-name', t(`achievement_name_${def.id}` as any))
    name.style.color = def.color
    const count = def.id === 'explorer' ? this.totals.zones : def.id === 'ring_master' ? Math.ceil(this.totals.rings * 0.75) : def.id === 'collector' ? this.totals.rings : 0
    const label = el('span', 'achievement-label', '')
    const description = el('span', 'achievement-desc', '')
    const refreshLocale = () => {
      label.textContent = `🏆 ${t('achievement_toast_label' as any)}`
      name.textContent = t(`achievement_name_${def.id}` as any)
      description.textContent = t(`achievement_desc_${def.id}` as any).replaceAll('{count}', String(count))
    }
    refreshLocale()
    text.append(label, name, description)
    document.addEventListener('localechange', refreshLocale)
    root.append(el('span', 'achievement-icon', def.icon), text)
    document.body.appendChild(root)

    setTimeout(() => {
      root.style.animation = 'notifSlideOut 0.3s ease forwards'
      setTimeout(() => {
        root.remove()
        document.removeEventListener('localechange', refreshLocale)
        done()
      }, 300)
    }, NOTIFICATION_MS)
  }
}

function el(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text // textContent: no HTML injection
  return node
}

/** Injected once (the old code appended a new <style> on every notification). */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .achievement-notif {
      position: fixed; top: 80px; right: 20px; z-index: 370; width: min(340px, calc(100vw - 40px));
      background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(16px);
      border: 1px solid #fff; border-radius: 12px; padding: 14px 20px;
      display: flex; align-items: center; gap: 14px;
      animation: notifSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    @keyframes notifSlideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes notifSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
    .achievement-icon { font-size: 2rem; }
    .achievement-text { display: flex; flex-direction: column; gap: 2px; }
    .achievement-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; }
    .achievement-name { font-size: 1rem; font-weight: 700; }
    .achievement-desc { font-size: 0.8rem; color: #64748b; }
    html[dir="rtl"] .achievement-notif { right: auto; left: 20px; }
    @media (max-width: 760px) { .achievement-notif { top: calc(108px + env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right)); } html[dir="rtl"] .achievement-notif { left: max(10px, env(safe-area-inset-left)); right: auto; } }
  `
  document.head.appendChild(style)
}

/** Shared instance used by the game and by the legacy helpers below. */
export const achievements = new AchievementManager()

// ─────────────────────────────────────────────────────────────
// Legacy function API (kept so existing imports keep working)
// ─────────────────────────────────────────────────────────────

export const getAchievementState = (): AchievementState => achievements.getState()
export const incrementRings = (amount = 1): void => {
  for (let i = 0; i < amount; i++) achievements.recordRing()
}
export const incrementJumps = (amount = 1): void => achievements.recordJump(amount)
export const visitZone = (name: string): void => achievements.visitZone(name)
/** Renamed internally (a function called useX trips React's hook lint rules). */
export const useBoost = (): void => achievements.recordBoost()
export const addDistance = (dist: number): void => achievements.addDistance(dist)
export const updateAchievementPanel = (): void => achievements.renderPanel()
export const resetState = (): void => achievements.reset()

export function createAchievementPanel(): void {
  const closeZone = (window as unknown as { closeZone?: () => void }).closeZone
  achievements.mountPanel(document.getElementById('achievements-panel'), {
    onClose: () => closeZone?.()
  })
}

/** @deprecated Use MiniGameField (minigames.ts) – it already contains collectible rings. */
export function createCollectibleRings(
  scene: THREE.Scene,
  positions: Array<{ x: number; y: number; z: number; id: string }>
): THREE.Group[] {
  const ringGeo = new THREE.TorusGeometry(1.0, 0.12, 12, 24)
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffd700,
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.9
  })
  return positions.map(({ x, y, z, id }) => {
    const group = new THREE.Group()
    group.position.set(x, y, z)
    group.userData = { achievementId: id, collected: false, baseY: y }
    group.add(new THREE.Mesh(ringGeo, ringMat))
    scene.add(group)
    return group
  })
}

/** @deprecated Use MiniGameField.collectRings(). */
export function checkRingCollection(carPos: THREE.Vector3, groups: THREE.Group[]): void {
  for (const group of groups) {
    if (group.userData.collected) continue
    if (group.position.distanceTo(carPos) < 3.5) {
      group.userData.collected = true
      group.visible = false
      const id = group.userData.achievementId
      achievements.recordRing(id ? String(id) : undefined)
    }
  }
}

