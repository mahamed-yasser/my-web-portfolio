import * as THREE from 'three'
import './ui/phase-three.css'
import { t, getLocale } from './i18n/index.js'
import { openProjectDetails, show3DFallback } from './bootstrap.js'
import { profile } from './data/profile.js'
import { achievements, ACHIEVEMENTS } from './world/achievements.js'
import { FuturisticHoverCar } from './world/car.js'
import { getDefaultClearZones, SynthwaveWorld } from './world/synthwave-world.js'
import { createCentralHub, ProjectStations } from './world/portfolio-space.js'
import { SoundEffects } from './world/sound-effects.js'
import type { Spaceship } from './world/spaceships.js'
import type { MiniGameField, NeonRing } from './world/minigames.js'
import type { RampSurface } from './world/types.js'
import type { SectionName } from './ui/phase-three.js'

declare global {
  interface Window {
    show3D(): void
    closeZone(): void
  }
}

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
let mobileViewport = window.matchMedia('(pointer: coarse), (max-width: 760px)').matches
const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
const constrainedDevice = deviceMemory <= 4 || navigator.hardwareConcurrency <= 4
const pixelRatioLimit = () => mobileViewport ? (constrainedDevice ? 1 : 1.25) : 2

function getViewportBounds() {
  const viewport = window.visualViewport
  return {
    width: Math.max(1, Math.round(viewport?.width ?? document.documentElement.clientWidth ?? window.innerWidth)),
    height: Math.max(1, Math.round(viewport?.height ?? document.documentElement.clientHeight ?? window.innerHeight))
  }
}

// ─── Scene Setup ──────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x09071b)

const initialViewport = getViewportBounds()
document.documentElement.style.setProperty('--visual-viewport-height', `${initialViewport.height}px`)
const camera = new THREE.PerspectiveCamera(mobileViewport ? (initialViewport.height > initialViewport.width ? 76 : 68) : 60, initialViewport.width / initialViewport.height, 0.1, 1000)
camera.position.set(0, 18, -25)

const renderer = new THREE.WebGLRenderer({
  antialias: !mobileViewport && !constrainedDevice,
  powerPreference: mobileViewport ? 'low-power' : 'high-performance'
})
let drawingBufferWidth = -1
let drawingBufferHeight = -1
let drawingBufferPixelRatio = -1
function updateDrawingBufferSize(width: number, height: number, pixelRatio: number) {
  if (width === drawingBufferWidth && height === drawingBufferHeight && pixelRatio === drawingBufferPixelRatio) return
  renderer.setDrawingBufferSize(width, height, pixelRatio)
  drawingBufferWidth = width
  drawingBufferHeight = height
  drawingBufferPixelRatio = pixelRatio
}
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault()
  show3DFallback(new Error('The WebGL context was lost.'))
}, { once: true })
updateDrawingBufferSize(initialViewport.width, initialViewport.height, Math.min(window.devicePixelRatio, pixelRatioLimit()))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = !mobileViewport
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.88
renderer.domElement.tabIndex = 0
renderer.domElement.setAttribute('data-i18n-aria-label', 'world_canvas_label')
renderer.domElement.setAttribute('aria-label', t('world_canvas_label'))
document.body.appendChild(renderer.domElement)

// ─── Initialize Synthwave World ──────────────────────────────
const synthwaveWorld = new SynthwaveWorld(scene, camera, renderer, {
  quality: mobileViewport ? (constrainedDevice ? 'low' : 'medium') : 'high',
  shadows: !mobileViewport,
  keepClear: [
    ...getDefaultClearZones(),
    { x: -130, z: -110, r: 20 },
    { x: 120, z: -72, r: 46 },
    { x: -130, z: 130, r: 20 },
    { x: 130, z: 140, r: 20 },
    { x: 0, z: 280, r: 20 }
  ]
})
synthwaveWorld.init()
const centralHub = createCentralHub(scene)
const projectTitle = (index: number) => t(`project_title_${index}` as any)
const projectStations = new ProjectStations(scene, profile.projects, projectTitle)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const soundEffects = new SoundEffects()
const displayedSkillGroups = (): Array<[string, string[]]> => [
  ['skills_languages', ['Python', 'JavaScript (ES6+)', 'HTML5/CSS3', 'Bash/Shell', 'TypeScript']],
  ['skills_frameworks', ['React (Learning)', 'Node.js (Basic)', 'Flask (Basic)', 'FastAPI', 'Three.js / WebGL', 'Telethon']],
  ['skills_ai_automation', ['n8n', 'Local LLMs / LM Studio', 'ComfyUI', 'AI Agents & Agentic Workflows']],
  ['skills_tools', ['Git & GitHub', 'FFmpeg', 'Docker', 'VS Code', 'Adobe Premiere Pro', 'DaVinci Resolve', 'Cloudflare Pages', 'Vercel']],
  ['skills_soft', ['skills_soft_item_0', 'skills_soft_item_1', 'skills_soft_item_2', 'skills_soft_item_3', 'skills_soft_item_4', 'skills_soft_item_5'].map(key => t(key as any))]
]

// ─── Create Futuristic Hover Car ─────────────────────────────
const car = new FuturisticHoverCar({ dynamicLights: !mobileViewport })
scene.add(car.group)
car.onJump = () => achievements.recordJump()
car.onBoost = () => achievements.recordBoost()
achievements.configure({ zones: 5 })

// ─── Zone System ──────────────────────────────────────────────
const zones: { pos: THREE.Vector3; name: string; group: THREE.Group; color: number; radius: number; labelTexture: THREE.CanvasTexture; labelCanvas: HTMLCanvasElement; paintLabel: () => void }[] = []
const zoneLabelKeys = { about: 'zone_about', projects: 'zone_projects', skills: 'zone_skills', experience: 'zone_experience', contact: 'zone_contact' } as const

function makeZoneLabel(name: keyof typeof zoneLabelKeys, color: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 192
  const ctx = canvas.getContext('2d')!
  const paint = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(8, 12, 30, .93)'
    ctx.beginPath()
    ctx.roundRect(4, 4, 504, 184, 22)
    ctx.fill()
    ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 47px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'
    ctx.fillText(t(zoneLabelKeys[name]), 256, 96, 440)
  }
  paint()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { canvas, texture, paint }
}

// All five zone markers share identical mesh geometry and neutral materials.
// Reuse them rather than allocating duplicates during world startup.
const zoneMarkerResources = {
  baseGeometry: new THREE.CylinderGeometry(2.8, 3.2, 0.7, 8),
  baseMaterial: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.85 }),
  ringGeometry: new THREE.TorusGeometry(3.2, 0.12, 12, 32),
  pillarGeometry: new THREE.CylinderGeometry(0.28, 0.28, 4.5, 8),
  pillarMaterial: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.32, metalness: 0.68 }),
  signGeometry: new THREE.BoxGeometry(4.5, 2.2, 0.35)
}

function createZoneMarker(x: number, z: number, color: number, name: keyof typeof zoneLabelKeys, radius = 18): THREE.Group {
  const group = new THREE.Group()

  // Base platform
  const base = new THREE.Mesh(zoneMarkerResources.baseGeometry, zoneMarkerResources.baseMaterial)
  base.position.y = 0.35
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  // Glowing ring
  const ringMat = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 4
  })
  const ring = new THREE.Mesh(zoneMarkerResources.ringGeometry, ringMat)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.06
  group.add(ring)

  // Pillar
  const pillar = new THREE.Mesh(zoneMarkerResources.pillarGeometry, zoneMarkerResources.pillarMaterial)
  pillar.position.y = 2.6
  pillar.castShadow = true
  group.add(pillar)

  // Sign panel
  const label = makeZoneLabel(name, color)
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: color,
    emissiveIntensity: 0.2,
    roughness: 0.32,
    map: label.texture
  })
  const sign = new THREE.Mesh(zoneMarkerResources.signGeometry, signMat)
  sign.position.y = 5.2
  sign.castShadow = true
  group.add(sign)

  // Point light
  const pointLight = new THREE.PointLight(color, 1.1, 15)
  pointLight.position.y = 5.2
  group.add(pointLight)

  group.position.set(x, 0, z)
  scene.add(group)
  zones.push({ pos: new THREE.Vector3(x, 0, z), name, group, color, radius, labelTexture: label.texture, labelCanvas: label.canvas, paintLabel: label.paint })
  return group
}

// Create zones
createZoneMarker(-130, -110, 0xa78bfa, 'about')
createZoneMarker(120, -72, 0x22d3ee, 'projects', 42)
createZoneMarker(-130, 130, 0x60a5fa, 'skills')
createZoneMarker(130, 140, 0x8b7cff, 'experience')
createZoneMarker(0, 280, 0x34d399, 'contact')

let activeProjectIndex = -1
let heroDismissed = false
let pinnedZone: string | null = null
let dismissedZone: string | null = null
type InteractionTarget = { type: 'project'; index: number } | { type: 'zone'; name: string }
let activeInteraction: InteractionTarget | null = null
const projectFilters = { search: '', category: 'all', technology: 'all', sort: 'featured' }
function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

function safeMediaUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value, window.location.href)
    return url.protocol === 'https:' || url.origin === window.location.origin ? url.href : null
  } catch { return null }
}

function avatarFallback(color = '#f0a50b', label = 'MY'): string {
  const safeColor = /^#[\da-f]{6}$/i.test(color) ? color : '#f0a50b'
  const safeLabel = label.slice(0, 2).replace(/[<&>]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${safeColor}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="38" fill="#1a1a2e" font-family="sans-serif" font-weight="bold">${safeLabel}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function projectFilterControls(): string {
  const categories = ['all', 'featured', 'web', 'automation', 'tool', 'experiment']
  const technologies = [...new Set(profile.projects.flatMap(project => project.techStack))].sort((a, b) => a.localeCompare(b))
  return `<div class="project-filters" role="search">
    <label class="project-search-wrap"><span class="project-search-icon" aria-hidden="true">⌕</span><input type="search" data-project-filter="search" aria-label="${t('project_search_placeholder')}" placeholder="${t('project_search_placeholder')}" value="${escapeAttribute(projectFilters.search)}"></label>
    <select data-project-filter="category" aria-label="${t('project_filter_category')}">${categories.map(category => `<option value="${category}" ${projectFilters.category === category ? 'selected' : ''}>${category === 'all' ? t('project_filter_all') : category === 'featured' ? t('project_filter_featured') : t(`project_category_${category}` as any)}</option>`).join('')}</select>
    <select data-project-filter="technology" aria-label="${t('project_filter_technology')}"><option value="all">${t('project_filter_all')} · ${t('project_filter_technology')}</option>${technologies.map(tech => `<option value="${escapeAttribute(tech)}" ${projectFilters.technology === tech ? 'selected' : ''}>${escapeAttribute(tech)}</option>`).join('')}</select>
    <select data-project-filter="sort" aria-label="${t('project_filter_sort')}"><option value="featured" ${projectFilters.sort === 'featured' ? 'selected' : ''}>${t('project_filter_featured_first')}</option><option value="name" ${projectFilters.sort === 'name' ? 'selected' : ''}>${t('project_filter_name')}</option></select>
  </div>`
}

function visibleProjects() {
  const query = projectFilters.search.trim().toLocaleLowerCase()
  const results = profile.projects.map((project, index) => ({ project, index })).filter(({ project, index }) => {
    const title = t(`project_title_${index}` as any)
    const description = t(`project_desc_${index}` as any)
    const matchesSearch = !query || [title, description, ...project.techStack].some(value => value.toLocaleLowerCase().includes(query))
    const matchesCategory = projectFilters.category === 'all' || (projectFilters.category === 'featured' ? !!project.featured : project.category === projectFilters.category)
    const matchesTechnology = projectFilters.technology === 'all' || project.techStack.includes(projectFilters.technology)
    return matchesSearch && matchesCategory && matchesTechnology
  })
  return results.sort((a, b) => projectFilters.sort === 'name'
    ? t(`project_title_${a.index}` as any).localeCompare(t(`project_title_${b.index}` as any), getLocale())
    : Number(!!b.project.featured) - Number(!!a.project.featured))
}

function projectCardMarkup(project: typeof profile.projects[number], index: number): string {
  const image = safeMediaUrl(project.image ?? project.screenshots?.[0])
  const githubUrl = safeExternalUrl(project.githubUrl)
  const liveUrl = safeExternalUrl(project.liveUrl)
  return `<article class="project-card ${activeProjectIndex === index ? 'selected' : ''}" data-project-index="${index}">
    ${image ? `<button type="button" class="project-card-media" data-open-project="${index}" aria-label="${t('project_view_screenshot')}"><img src="${escapeAttribute(image)}" alt="${escapeAttribute(t(`project_title_${index}` as any))}" loading="lazy" decoding="async"></button>` : `<div class="project-card-media project-card-media-empty" aria-hidden="true"><span>✦</span></div>`}
    <div class="project-header"><span class="project-category">${t(`project_category_${project.category}` as any)}</span><span class="project-title">${t(`project_title_${index}` as any)}</span>${project.featured ? `<span class="project-featured">${t('projects_featured')}</span>` : ''}</div>
    <p class="project-desc">${t(`project_long_description_${index}` as any)}</p>
    <div class="tech-stack">${project.techStack.map(tech => `<span class="tag">${escapeAttribute(tech)}</span>`).join('')}</div>
    <div class="project-actions"><button type="button" class="project-link project-details-action" data-open-project="${index}">${t('project_details')}</button>${githubUrl ? `<a href="${escapeAttribute(githubUrl)}" target="_blank" rel="noopener noreferrer" class="project-link">${t('view_github')}</a>` : ''}${liveUrl ? `<a href="${escapeAttribute(liveUrl)}" target="_blank" rel="noopener noreferrer" class="project-link">${t('view_live_demo')}</a>` : ''}</div>
  </article>`
}

document.addEventListener('error', event => {
  const target = event.target
  if (!(target instanceof HTMLImageElement) || !target.closest('.project-card-media')) return
  const container = target.parentElement
  if (!container) return
  container.replaceChildren(Object.assign(document.createElement('span'), { textContent: t('project_media_error') }))
  container.classList.add('project-card-media-empty')
}, true)

function renderProjectResults() {
  const panelResults = document.getElementById('project-results')
  if (panelResults) {
    const results = visibleProjects()
    if (!results.length) panelResults.innerHTML = `<p class="project-empty">${t('project_filter_empty')}</p>`
    else if (projectFilters.sort === 'featured' && projectFilters.category === 'all' && !projectFilters.search && projectFilters.technology === 'all') {
      const featured = results.filter(item => item.project.featured)
      const others = results.filter(item => !item.project.featured)
      panelResults.innerHTML = `<h3>${t('projects_title')}</h3>${featured.map(item => projectCardMarkup(item.project, item.index)).join('')}${others.length ? `<h3>${t('more_projects')}</h3>${others.map(item => projectCardMarkup(item.project, item.index)).join('')}` : ''}`
    } else panelResults.innerHTML = results.map(item => projectCardMarkup(item.project, item.index)).join('')
  }
  const classicResults = document.getElementById('classic-projects')
  if (classicResults) {
    const results = visibleProjects()
    classicResults.innerHTML = results.length ? results.map(item => projectCardMarkup(item.project, item.index)).join('') : `<p class="project-empty">${t('project_filter_empty')}</p>`
  }
}

function syncProjectFilterValues() {
  document.querySelectorAll<HTMLInputElement>('[data-project-filter="search"]').forEach(input => { input.value = projectFilters.search })
  document.querySelectorAll<HTMLSelectElement>('[data-project-filter="category"]').forEach(select => { select.value = projectFilters.category })
  document.querySelectorAll<HTMLSelectElement>('[data-project-filter="technology"]').forEach(select => { select.value = projectFilters.technology })
  document.querySelectorAll<HTMLSelectElement>('[data-project-filter="sort"]').forEach(select => { select.value = projectFilters.sort })
}

function initializeClassicScrollPolish() {
  const scroller = document.getElementById('classic-view')
  const progress = document.getElementById('classic-scroll-progress')
  if (!(scroller instanceof HTMLElement) || !(progress instanceof HTMLElement)) return
  const updateProgress = () => {
    // The classic view starts hidden. Measuring its scroll dimensions during
    // 3D startup forces layout for a section the visitor may never open.
    if (!scroller.classList.contains('active')) return
    const range = scroller.scrollHeight - scroller.clientHeight
    progress.style.width = `${range > 0 ? Math.min(100, (scroller.scrollTop / range) * 100) : 0}%`
  }
  scroller.addEventListener('scroll', updateProgress, { passive: true })
  window.addEventListener('resize', updateProgress, { passive: true })
  new MutationObserver(updateProgress).observe(scroller, { childList: true, subtree: true })
  updateProgress()

}

// These secondary world systems are loaded after the first interactive frame.
// The driving scene, project stations, and zone controls remain available first.
let ships: Spaceship[] = []
let ramps: RampSurface[] = []
let rings: NeonRing[] = []
let ringsField: MiniGameField | undefined
const yieldToNextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
let secondarySystemsStarted = false

async function initializeSecondaryWorldSystems() {
  if (secondarySystemsStarted) return
  secondarySystemsStarted = true
  try {
    const spaceshipModule = await import('./world/spaceships.js')
    ships = spaceshipModule.createSpaceshipTraffic(scene, 4)
    await yieldToNextFrame()

    const miniGameModule = await import('./world/minigames.js')
    const miniGames = miniGameModule.createMiniGameElements(scene)
    ramps = miniGames.ramps
    rings = miniGames.rings
    ringsField = miniGames.field
  } catch (error) {
    console.error('Secondary world features could not be initialized.', error)
  }
}

function scheduleSecondaryWorldSystems() {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  }
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(() => { void initializeSecondaryWorldSystems() }, { timeout: 1200 })
  else window.setTimeout(() => { void initializeSecondaryWorldSystems() }, 0)
}

// ─── Controls ─────────────────────────────────────────────────
const keys: Record<string, boolean> = {}
function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName))
}
window.addEventListener('keydown', e => {
  const vehicleKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'KeyR'].includes(e.code)
  const classicOpen = document.getElementById('classic-view')?.classList.contains('active')
  const phaseThreeOpen = document.querySelector('#assistant-panel:not([hidden]), #terminal-panel:not([hidden]), #recruiter-panel:not([hidden]), #project-detail-panel:not([hidden]), #project-gallery-viewer:not([hidden])') !== null
  if (!vehicleKey || classicOpen || phaseThreeOpen || isEditableTarget(e.target)) return
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    heroDismissed = true
    document.querySelector('.hero-intro')?.setAttribute('hidden', '')
  }
  if (e.target === document.getElementById('touch-boost') && ['Space', 'Enter'].includes(e.code)) {
    if (e.cancelable) e.preventDefault()
    keys['ShiftLeft'] = true
    document.getElementById('touch-boost')?.classList.add('pressed')
    return
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && e.cancelable) e.preventDefault()
  keys[e.code] = true
})
window.addEventListener('keyup', e => {
  keys[e.code] = false
  if (e.target === document.getElementById('touch-boost') && ['Space', 'Enter'].includes(e.code)) {
    keys['ShiftLeft'] = false
    document.getElementById('touch-boost')?.classList.remove('pressed')
  }
})
window.addEventListener('blur', () => {
  Object.keys(keys).forEach(code => { keys[code] = false })
})

// Empty-canvas drag drives the car. HUD and dialog elements never initiate it.
const driveInput = { x: 0, y: 0, active: false }
let drivePointerId: number | null = null
let driveStartX = 0
let driveStartY = 0
let suppressCanvasClickUntil = 0
const driveFeedback = document.getElementById('drive-feedback')
const driveExcludedSelector = [
  '[data-no-drive]', '[data-interactive-ui]', 'button', 'a', 'input', 'textarea', 'select',
  '[role="button"]', '[role="dialog"]', '[contenteditable="true"]',
  '.top-bar', '.hero-actions', '.zone-panel', '.ach-panel',
  '.touch-controls', '#universe-controls', '.world-interaction', '.minimap',
].join(',')

function resetDrivePointer() {
  driveInput.x = 0
  driveInput.y = 0
  driveInput.active = false
  drivePointerId = null
  driveFeedback?.setAttribute('data-active', 'false')
  driveFeedback?.setAttribute('aria-hidden', 'true')
}

function updateDrivePointer(event: PointerEvent) {
  if (!driveInput.active || event.pointerId !== drivePointerId) return
  if (event.cancelable) event.preventDefault()
  const range = Math.max(64, Math.min(renderer.domElement.clientWidth, renderer.domElement.clientHeight) * 0.18)
  driveInput.x = THREE.MathUtils.clamp((event.clientX - driveStartX) / range, -1, 1)
  driveInput.y = THREE.MathUtils.clamp((event.clientY - driveStartY) / range, -1, 1)
  if (Math.hypot(event.clientX - driveStartX, event.clientY - driveStartY) > 10) suppressCanvasClickUntil = performance.now() + 450
  driveFeedback?.setAttribute('data-active', 'true')
  driveFeedback?.setAttribute('aria-hidden', 'false')
  driveFeedback?.style.setProperty('--drive-x', `${Math.round(driveInput.x * 100)}%`)
  driveFeedback?.style.setProperty('--drive-y', `${Math.round(-driveInput.y * 100)}%`)
  if (Math.abs(driveInput.x) > 0.12 || Math.abs(driveInput.y) > 0.12) {
    heroDismissed = true
    document.querySelector('.hero-intro')?.setAttribute('hidden', '')
    suppressCanvasClickUntil = performance.now() + 450
  }
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (drivePointerId !== null || !['touch', 'pen'].includes(event.pointerType)) return
  if (event.target !== renderer.domElement || (event.target as Element).closest(driveExcludedSelector)) return
  if (document.getElementById('classic-view')?.classList.contains('active')) return
  if (document.querySelector('#assistant-panel:not([hidden]), #terminal-panel:not([hidden]), #recruiter-panel:not([hidden]), #project-detail-panel:not([hidden]), #project-gallery-viewer:not([hidden])')) return
  event.preventDefault()
  drivePointerId = event.pointerId
  driveStartX = event.clientX
  driveStartY = event.clientY
  driveFeedback?.style.setProperty('--drive-start-x', `${event.clientX}px`)
  driveFeedback?.style.setProperty('--drive-start-y', `${event.clientY}px`)
  driveInput.active = true
  driveInput.x = 0
  driveInput.y = 0
  driveFeedback?.setAttribute('data-active', 'true')
  driveFeedback?.setAttribute('aria-hidden', 'false')
  renderer.domElement.setPointerCapture(event.pointerId)
})
renderer.domElement.addEventListener('pointermove', updateDrivePointer)
const finishDrivePointer = (event: PointerEvent) => {
  if (event.pointerId !== drivePointerId) return
  resetDrivePointer()
}
renderer.domElement.addEventListener('pointerup', finishDrivePointer)
renderer.domElement.addEventListener('pointercancel', finishDrivePointer)
renderer.domElement.addEventListener('lostpointercapture', resetDrivePointer)
window.addEventListener('blur', resetDrivePointer)
window.addEventListener('pagehide', resetDrivePointer)
document.addEventListener('visibilitychange', () => { if (document.hidden) resetDrivePointer() })

const boostButton = document.getElementById('touch-boost')
boostButton?.addEventListener('pointerdown', event => {
  if (event.cancelable) event.preventDefault()
  keys['ShiftLeft'] = true
  boostButton.classList.add('pressed')
  boostButton.setPointerCapture(event.pointerId)
})
const releaseBoost = () => { keys['ShiftLeft'] = false; boostButton?.classList.remove('pressed') }
boostButton?.addEventListener('pointerup', releaseBoost)
boostButton?.addEventListener('pointercancel', releaseBoost)
boostButton?.addEventListener('lostpointercapture', releaseBoost)
window.addEventListener('blur', () => { resetDrivePointer(); releaseBoost() })
document.addEventListener('phase3:modal-open', () => {
  Object.keys(keys).forEach(code => { keys[code] = false })
  resetDrivePointer()
  releaseBoost()
})
document.getElementById('touch-reset')?.addEventListener('click', () => car.reset())

function getControls() {
  return {
    throttle: driveInput.active && Math.abs(driveInput.y) > 0.08 ? -driveInput.y : undefined,
    steering: driveInput.active && Math.abs(driveInput.x) > 0.08 ? -driveInput.x : undefined,
    forward: keys['KeyW'] || keys['ArrowUp'],
    backward: keys['KeyS'] || keys['ArrowDown'],
    left: keys['KeyA'] || keys['ArrowLeft'],
    right: keys['KeyD'] || keys['ArrowRight'],
    brake: keys['ControlLeft'] || keys['ControlRight'],
    jump: keys['Space'],
    boost: keys['ShiftLeft'] || keys['ShiftRight'],
    reset: keys['KeyR']
  }
}

// ─── Camera Follow ────────────────────────────────────────────
const camOffset = new THREE.Vector3(0, 15, 22)
const camTarget = new THREE.Vector3()
const cameraGoal = new THREE.Vector3()
const targetGoal = new THREE.Vector3()
const cameraFocus = new THREE.Vector3()
let cameraFocusTime = 0
type ExperienceMode = 'free' | 'guided' | 'cinematic'
let experienceMode: ExperienceMode = 'free'
let tourStep = 0
let tourElapsed = 0
let cameraDirector: { position: THREE.Vector3; target: THREE.Vector3 } | null = null
let cameraDirectorTime = 0
let tourSteps: Array<{ position: THREE.Vector3; label: string; projectIndex?: number }> = []

function setDirectedView(position: THREE.Vector3, target: THREE.Vector3, duration = 0) {
  cameraDirector = { position: position.clone(), target: target.clone() }
  cameraDirectorTime = duration
}

function setExperienceMode(mode: ExperienceMode) {
  experienceMode = mode
  const controls = document.getElementById('universe-controls')
  controls?.classList.toggle('tour-running', mode !== 'free')
  if (mode === 'free') {
    cameraDirector = null
    projectStations.setSelected(activeProjectIndex)
  } else {
    const zoneSteps = zones.map(zone => ({ position: zone.pos.clone(), label: t(zoneLabelKeys[zone.name as keyof typeof zoneLabelKeys]) }))
    const projectSteps = projectStations.positions.map((position, projectIndex) => ({ position: position.clone(), projectIndex, label: projectTitle(projectIndex) }))
    tourSteps = [...zoneSteps.slice(0, 2), ...projectSteps, ...zoneSteps.slice(2)]
    tourStep = 0
    tourElapsed = 0
    moveTourToStep()
  }
  controls?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)))
}

function moveTourToStep() {
  const step = tourSteps[tourStep]
  if (!step) { setExperienceMode('free'); return }
  const target = step.position.clone().add(new THREE.Vector3(0, step.projectIndex === undefined ? 2 : 3, 0))
  const direction = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), step.projectIndex === undefined ? 0 : Math.PI * 0.72)
  const position = target.clone().add(direction.multiplyScalar(mobileViewport ? 28 : 24)).add(new THREE.Vector3(0, 13, 0))
  setDirectedView(position, target)
  projectStations.setSelected(step.projectIndex ?? -1)
  if (step.projectIndex !== undefined) activeProjectIndex = step.projectIndex
  tourElapsed = 0
}

let worldControlsExpanded = false
function syncUniverseControlsCompact() {
  const panel = document.getElementById('universe-controls')
  if (!panel) return
  const compactViewport = window.matchMedia('(max-width: 760px), (max-width: 1024px) and (max-height: 500px)').matches
  const collapsed = compactViewport && !worldControlsExpanded
  panel.classList.toggle('uc-collapsed', collapsed)
  panel.querySelector<HTMLButtonElement>('.uc-title')?.setAttribute('aria-expanded', String(!collapsed))
}
window.addEventListener('resize', syncUniverseControlsCompact, { passive: true })

function buildUniverseControls() {
  const style = document.createElement('style')
  style.textContent = `#universe-controls{position:fixed;z-index:12;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));width:min(300px,calc(100vw - 28px));padding:12px;border:1px solid #67e8f944;border-radius:14px;background:#07111fe8;color:#e2e8f0;box-shadow:0 12px 36px #0007;backdrop-filter:blur(12px);font:500 12px/1.35 system-ui,sans-serif}#universe-controls .uc-row{display:flex;gap:6px;align-items:center;margin-top:8px}#universe-controls .uc-title{font-weight:750;color:#a5f3fc;letter-spacing:.06em}#universe-controls .uc-style-state{margin-top:6px;color:#c4b5fd;font-size:11px;font-weight:700}#universe-controls button,#universe-controls select{min-height:44px;border:1px solid #ffffff30;border-radius:8px;background:#0f2033;color:#f8fafc;padding:6px 9px;font:inherit}#universe-controls button[aria-pressed=true]{border-color:#67e8f9;background:#164e63}#universe-controls button:focus-visible,#universe-controls select:focus-visible{outline:2px solid #67e8f9;outline-offset:2px}#universe-controls .uc-row>button{flex:1}#universe-controls .uc-detail{display:none;gap:6px;margin-top:8px}#universe-controls.tour-running .uc-detail{display:flex}#universe-controls input[type=range]{min-width:45px;width:76px;accent-color:#67e8f9}#universe-controls label{display:flex;align-items:center;gap:6px}html[dir=rtl] #universe-controls{right:auto;left:max(14px,env(safe-area-inset-left))}@media(max-width:760px){#universe-controls{right:8px;left:8px;bottom:calc(76px + env(safe-area-inset-bottom));width:auto;padding:9px}html[dir=rtl] #universe-controls{right:8px;left:8px}#universe-controls .uc-row{gap:5px;margin-top:6px}#universe-controls button,#universe-controls select{min-height:44px;padding:6px;font-size:11px}}@media(max-height:430px) and (orientation:landscape){#universe-controls{right:auto;left:max(8px,env(safe-area-inset-left));bottom:8px;width:min(270px,calc(100vw - 148px));padding:7px}html[dir=rtl] #universe-controls{left:auto;right:max(8px,env(safe-area-inset-right))}#universe-controls .uc-row{margin-top:4px}#universe-controls button,#universe-controls select{min-height:44px}}`;
  style.textContent += `#universe-controls .uc-title{width:100%;min-height:44px;padding:4px 6px;border:0;background:transparent;text-align:start;font-weight:750;color:#a5f3fc;letter-spacing:.06em}#universe-controls button.uc-title{border:0;background:transparent;text-align:start}#universe-controls.uc-collapsed>.uc-row,#universe-controls.uc-collapsed>.uc-detail,#universe-controls.uc-collapsed>.uc-style-state{display:none}html[dir=rtl] #universe-controls:not(.uc-collapsed){right:max(14px,env(safe-area-inset-right));left:auto}@media(max-width:760px){#universe-controls.uc-collapsed{right:8px;left:auto;bottom:calc(76px + env(safe-area-inset-bottom));width:min(220px,calc(100vw - 16px))}html[dir=rtl] #universe-controls.uc-collapsed{right:auto;left:8px}}@media(max-height:500px) and (orientation:landscape){#universe-controls.uc-collapsed{right:auto;left:max(8px,env(safe-area-inset-left));bottom:8px;width:min(220px,calc(100vw - 148px))}html[dir=rtl] #universe-controls.uc-collapsed{right:auto;left:max(8px,env(safe-area-inset-left))}}`
  style.textContent += `@media(max-width:1024px) and (max-height:500px){#universe-controls.uc-collapsed{right:auto;left:max(8px,env(safe-area-inset-left));bottom:8px;width:min(220px,calc(100vw - 148px))}html[dir=rtl] #universe-controls.uc-collapsed{right:auto;left:max(8px,env(safe-area-inset-left))}}`
  document.head.append(style)
  const panel = document.createElement('section')
  panel.id = 'universe-controls'
  panel.setAttribute('aria-label', t('world_controls'))
  panel.innerHTML = `<button type="button" class="uc-title" aria-expanded="true">${t('world_controls')}</button><div class="uc-row"><button type="button" data-mode="free" aria-pressed="true">${t('world_free')}</button><button type="button" data-mode="guided" aria-pressed="false">${t('world_guided')}</button><button type="button" data-mode="cinematic" aria-pressed="false">${t('world_cinematic')}</button></div><div class="uc-detail"><button type="button" data-tour-next>${t('world_next')}</button><button type="button" data-tour-exit>${t('world_exit')}</button><span id="tour-caption" aria-live="polite"></span></div><div class="uc-row"><label for="world-preset">${t('world_preset')}</label><select id="world-preset" aria-label="${t('world_preset')}"><option value="neon">${t('preset_neon')}</option><option value="dark">${t('preset_dark')}</option><option value="clean">${t('preset_clean')}</option><option value="sunset">${t('preset_sunset')}</option></select></div><div class="uc-style-state" id="world-preset-active" aria-live="polite"></div><div class="uc-row"><label><input id="world-sound" type="checkbox"> ${t('world_sound')}</label><input id="world-volume" type="range" min="0" max="1" step="0.05" value="0.35" aria-label="${t('world_volume')}"></div>`
  const presetSelect = panel.querySelector<HTMLSelectElement>('#world-preset')
  if (presetSelect) presetSelect.value = activeWorldPreset
  updatePresetLabel()
  document.getElementById('hud')?.append(panel)
  syncUniverseControlsCompact()
  panel.querySelector<HTMLButtonElement>('.uc-title')?.addEventListener('click', () => {
    if (!window.matchMedia('(max-width: 760px), (max-width: 1024px) and (max-height: 500px)').matches) return
    worldControlsExpanded = !worldControlsExpanded
    syncUniverseControlsCompact()
  })
  panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => { setExperienceMode(button.dataset.mode as ExperienceMode); soundEffects.play('select') }))
  panel.querySelector<HTMLButtonElement>('[data-tour-next]')?.addEventListener('click', () => { tourStep++; if (tourStep >= tourSteps.length) setExperienceMode('free'); else moveTourToStep() })
  panel.querySelector<HTMLButtonElement>('[data-tour-exit]')?.addEventListener('click', () => setExperienceMode('free'))
  panel.querySelector<HTMLSelectElement>('#world-preset')?.addEventListener('change', event => { applyWorldPreset((event.currentTarget as HTMLSelectElement).value); soundEffects.play('preset') })
  panel.querySelector<HTMLInputElement>('#world-sound')?.addEventListener('change', event => { void soundEffects.setEnabled((event.currentTarget as HTMLInputElement).checked); if ((event.currentTarget as HTMLInputElement).checked) soundEffects.play('select') })
  panel.querySelector<HTMLInputElement>('#world-volume')?.addEventListener('input', event => soundEffects.setVolume(Number((event.currentTarget as HTMLInputElement).value)))
  document.addEventListener('localechange', () => {
    const currentMode = experienceMode
    const previousTourStep = tourStep
    const volume = soundEffects.currentVolume
    panel.remove()
    style.remove()
    buildUniverseControls()
    const rebuiltPanel = document.getElementById('universe-controls')
    const soundToggle = rebuiltPanel?.querySelector<HTMLInputElement>('#world-sound')
    const volumeSlider = rebuiltPanel?.querySelector<HTMLInputElement>('#world-volume')
    if (soundToggle) soundToggle.checked = soundEffects.isEnabled
    if (volumeSlider) volumeSlider.value = String(volume)
    setExperienceMode(currentMode)
    if (currentMode !== 'free' && previousTourStep > 0 && previousTourStep < tourSteps.length) {
      tourStep = previousTourStep
      moveTourToStep()
    }
    window.requestAnimationFrame(updatePresetLabel)
  }, { once: true })
}

interface WorldPreset {
  background: number; fog: number; fogDensity: number; exposure: number
  ambient: number; ambientColor: number
  hemisphere: number; sky: number; ground: number
  directional: number[]; directionalColors: number[]; pointScale: number; carLightingScale: number; emissiveScale: number; gridOpacity: number
  groundMaterial: number; groundRoughness: number; groundMetalness: number
  gridCyan: number; gridAccent: number
}
const worldPresets: Record<string, WorldPreset> = {
  neon: { background: 0x09071b, fog: 0x09071b, fogDensity: 0.0032, exposure: 0.96, ambient: 0.52, ambientColor: 0x59466f, hemisphere: 0.46, sky: 0x554080, ground: 0x171326, directional: [0.72, 0.5, 0.98], directionalColors: [0x00c9df, 0xc04be0, 0xff7954], pointScale: 0.78, carLightingScale: 0.85, emissiveScale: 0.48, gridOpacity: 0.48, groundMaterial: 0x0b0820, groundRoughness: 0.48, groundMetalness: 0.42, gridCyan: 0x00cde6, gridAccent: 0xe44dff },
  dark: { background: 0x080d18, fog: 0x101827, fogDensity: 0.0028, exposure: 0.9, ambient: 0.42, ambientColor: 0x53617a, hemisphere: 0.42, sky: 0x526a96, ground: 0x171c2a, directional: [0.6, 0.45, 0.85], directionalColors: [0x718bd8, 0x7662b9, 0x9bb4d8], pointScale: 0.68, carLightingScale: 0.62, emissiveScale: 0.42, gridOpacity: 0.34, groundMaterial: 0x070d18, groundRoughness: 0.68, groundMetalness: 0.28, gridCyan: 0x41679d, gridAccent: 0x877bb7 },
  clean: { background: 0x142235, fog: 0x263b52, fogDensity: 0.0022, exposure: 0.98, ambient: 0.56, ambientColor: 0x8297aa, hemisphere: 0.5, sky: 0x83a9c8, ground: 0x344356, directional: [0.65, 0.48, 0.92], directionalColors: [0x6fced3, 0x9baee5, 0xe1d8bd], pointScale: 0.78, carLightingScale: 0.72, emissiveScale: 0.46, gridOpacity: 0.38, groundMaterial: 0x1a2d3b, groundRoughness: 0.72, groundMetalness: 0.18, gridCyan: 0x65cdd2, gridAccent: 0xc5e7e6 },
  sunset: { background: 0x24142b, fog: 0x542b45, fogDensity: 0.0034, exposure: 0.95, ambient: 0.52, ambientColor: 0x875b6c, hemisphere: 0.45, sky: 0x9c5367, ground: 0x302032, directional: [0.68, 0.48, 0.92], directionalColors: [0xf07876, 0xc879a3, 0xffb06e], pointScale: 0.76, carLightingScale: 0.78, emissiveScale: 0.46, gridOpacity: 0.42, groundMaterial: 0x281827, groundRoughness: 0.56, groundMetalness: 0.3, gridCyan: 0xdf8054, gridAccent: 0xffbc71 }
}
let activeWorldPreset = 'neon'
type ColorTween = { target: THREE.Color; from: THREE.Color; to: THREE.Color }
type NumberTween = { set(value: number): void; from: number; to: number }
type BufferTween = { target: THREE.BufferAttribute; from: Float32Array; to: Float32Array }
let presetTransition: { elapsed: number; duration: number; colors: ColorTween[]; numbers: NumberTween[]; buffers: BufferTween[] } | null = null
const originalEmissive = new WeakMap<THREE.Material, number>()
const originalPointIntensity = new WeakMap<THREE.PointLight, number>()
const originalGridColors = new WeakMap<THREE.BufferGeometry, Float32Array>()
const presetTitleKeys: Record<string, string> = { neon: 'preset_neon', dark: 'preset_dark', clean: 'preset_clean', sunset: 'preset_sunset' }

function updatePresetLabel() {
  const label = document.getElementById('world-preset-active')
  if (label) label.textContent = `${t('world_active_style' as any)}: ${t(presetTitleKeys[activeWorldPreset] as any)}`
}

function applyWorldPreset(key: string) {
  const preset = worldPresets[key] ?? worldPresets.neon
  activeWorldPreset = worldPresets[key] ? key : 'neon'
  const selector = document.getElementById('world-preset') as HTMLSelectElement | null
  if (selector) selector.value = activeWorldPreset
  updatePresetLabel()
  car.setLightingScale(preset.carLightingScale)
  const colors: ColorTween[] = []
  const numbers: NumberTween[] = []
  const buffers: BufferTween[] = []
  const transitionColor = (target: THREE.Color, hex: number) => colors.push({ target, from: target.clone(), to: new THREE.Color(hex) })
  const transitionNumber = (from: number, to: number, set: (value: number) => void) => numbers.push({ from, to, set })
  const bg = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0x09071b)
  if (!(scene.background instanceof THREE.Color)) scene.background = bg
  transitionColor(bg, preset.background)
  if (scene.fog instanceof THREE.FogExp2) {
    transitionColor(scene.fog.color, preset.fog)
    transitionNumber(scene.fog.density, preset.fogDensity, value => { if (scene.fog instanceof THREE.FogExp2) scene.fog.density = value })
  }

  const ambient: THREE.AmbientLight[] = []
  const hemisphere: THREE.HemisphereLight[] = []
  const directional: THREE.DirectionalLight[] = []
  const pointLights: THREE.PointLight[] = []
  scene.traverse(object => {
    if (object instanceof THREE.AmbientLight) ambient.push(object)
    else if (object instanceof THREE.HemisphereLight) hemisphere.push(object)
    else if (object instanceof THREE.DirectionalLight) directional.push(object)
    else if (object instanceof THREE.PointLight) pointLights.push(object)
    else if (object instanceof THREE.LineSegments && object.material instanceof THREE.LineBasicMaterial) {
      const gridMaterial = object.material
      transitionNumber(gridMaterial.opacity, preset.gridOpacity, value => { gridMaterial.opacity = value })
      if (object.userData.worldRole === 'grid') {
        const attribute = object.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
        if (attribute) {
          if (!originalGridColors.has(object.geometry)) originalGridColors.set(object.geometry, Float32Array.from(attribute.array as ArrayLike<number>))
          const base = originalGridColors.get(object.geometry)!
          const cyan = new THREE.Color(preset.gridCyan)
          const accent = new THREE.Color(preset.gridAccent)
          const target = new Float32Array(base.length)
          for (let offset = 0; offset < base.length; offset += 3) {
            const color = base[offset] > base[offset + 1] ? accent : cyan
            target[offset] = color.r
            target[offset + 1] = color.g
            target[offset + 2] = color.b
          }
          buffers.push({ target: attribute, from: Float32Array.from(attribute.array as ArrayLike<number>), to: target })
        }
      }
    }
    if (object.userData.worldRole === 'ground') {
      const groundMesh = object as THREE.Mesh
      const materials = Array.isArray(groundMesh.material) ? groundMesh.material : [groundMesh.material]
      for (const material of materials) {
        const groundMaterial = material as THREE.MeshStandardMaterial
        if (groundMaterial.color) transitionColor(groundMaterial.color, preset.groundMaterial)
        transitionNumber(groundMaterial.roughness, preset.groundRoughness, value => { groundMaterial.roughness = value })
        transitionNumber(groundMaterial.metalness, preset.groundMetalness, value => { groundMaterial.metalness = value })
      }
    }
    const mesh = object as THREE.Mesh
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      const emissiveMaterial = material as THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number }
      if (!emissiveMaterial.emissive || emissiveMaterial.emissiveIntensity === undefined) continue
      if (!originalEmissive.has(material)) originalEmissive.set(material, emissiveMaterial.emissiveIntensity)
      const base = originalEmissive.get(material) ?? emissiveMaterial.emissiveIntensity
      transitionNumber(emissiveMaterial.emissiveIntensity, base * preset.emissiveScale, value => { emissiveMaterial.emissiveIntensity = value })
    }
  })

  ambient.forEach(light => {
    transitionColor(light.color, preset.ambientColor)
    transitionNumber(light.intensity, preset.ambient, value => { light.intensity = value })
  })
  hemisphere.forEach(light => {
    transitionColor(light.color, preset.sky)
    transitionColor(light.groundColor, preset.ground)
    transitionNumber(light.intensity, preset.hemisphere, value => { light.intensity = value })
  })
  directional.forEach((light, index) => {
    const color = preset.directionalColors[index] ?? preset.directionalColors[preset.directionalColors.length - 1]
    const intensity = preset.directional[index] ?? preset.directional[preset.directional.length - 1]
    transitionColor(light.color, color)
    transitionNumber(light.intensity, intensity, value => { light.intensity = value })
  })
  pointLights.forEach(light => {
    if (!originalPointIntensity.has(light)) originalPointIntensity.set(light, light.intensity)
    const base = originalPointIntensity.get(light) ?? light.intensity
    transitionNumber(light.intensity, base * preset.pointScale, value => { light.intensity = value })
  })
  transitionNumber(renderer.toneMappingExposure, preset.exposure, value => { renderer.toneMappingExposure = value })
  presetTransition = { elapsed: 0, duration: 1.1, colors, numbers, buffers }
  try { localStorage.setItem('world-preset', activeWorldPreset) } catch { /* Optional preference. */ }
}

function updateWorldPreset(delta: number) {
  if (!presetTransition) return
  const transition = presetTransition
  transition.elapsed = Math.min(transition.duration, transition.elapsed + delta)
  const raw = transition.elapsed / transition.duration
  const amount = raw * raw * (3 - 2 * raw)
  transition.colors.forEach(item => item.target.copy(item.from).lerp(item.to, amount))
  transition.numbers.forEach(item => item.set(THREE.MathUtils.lerp(item.from, item.to, amount)))
  transition.buffers.forEach(item => {
    for (let index = 0; index < item.from.length; index++) item.target.array[index] = THREE.MathUtils.lerp(item.from[index], item.to[index], amount)
    item.target.needsUpdate = true
  })
  if (raw >= 1) presetTransition = null
}

buildUniverseControls()
applyWorldPreset('neon')
try {
  const savedPreset = localStorage.getItem('world-preset')
  if (savedPreset && worldPresets[savedPreset]) {
    const select = document.getElementById('world-preset') as HTMLSelectElement | null
    if (select) select.value = savedPreset
    applyWorldPreset(savedPreset)
  }
} catch { /* Default world remains available without storage. */ }

function updateCamera(delta: number) {
  if (cameraDirector) {
    const blend = 1 - Math.exp(-2.2 * delta)
    camera.position.lerp(cameraDirector.position, blend)
    camTarget.lerp(cameraDirector.target, blend)
    camera.lookAt(camTarget)
    if (cameraDirectorTime > 0 && (cameraDirectorTime = Math.max(0, cameraDirectorTime - delta)) === 0) cameraDirector = null
    return
  }
  const carPos = car.position
  const angle = car.angle
  const distance = mobileViewport ? 25 : 22
  const height = mobileViewport ? 17 : 15

  camOffset.set(
    -Math.sin(angle) * distance,
    height,
    -Math.cos(angle) * distance
  )

  cameraGoal.copy(carPos).add(camOffset)
  const follow = 1 - Math.exp(-5.5 * delta)
  camera.position.lerp(cameraGoal, follow)

  targetGoal.set(carPos.x, carPos.y + 1.5, carPos.z)
  if (cameraFocusTime > 0) {
    cameraFocusTime = Math.max(0, cameraFocusTime - delta)
    const blend = cameraFocusTime > 0.55 ? 0.52 : cameraFocusTime * 0.95
    targetGoal.lerp(cameraFocus, blend)
  }
  camTarget.lerp(targetGoal, 1 - Math.exp(-8 * delta))
  camera.lookAt(camTarget)
}

// ─── Zone Detection ───────────────────────────────────────────
let activeZone: string | null = null

function checkZones() {
  const carPos = car.position
  for (const zone of zones) {
    const dist = carPos.distanceTo(zone.pos)
    const panel = document.getElementById(`zone-${zone.name}`)
    const inside = dist < zone.radius
    if (!inside && dismissedZone === zone.name) dismissedZone = null
    if ((inside && dismissedZone !== zone.name) || pinnedZone === zone.name) {
      if (!panel) continue
      panel.classList.add('active')
      if (panel.inert) panel.inert = false
      if (panel.getAttribute('aria-hidden') !== 'false') panel.setAttribute('aria-hidden', 'false')
      activeZone = zone.name
      achievements.visitZone(zone.name)
    } else if (panel) {
      panel.classList.remove('active')
      if (!panel.inert) panel.inert = true
      if (panel.getAttribute('aria-hidden') !== 'true') panel.setAttribute('aria-hidden', 'true')
      if (activeZone === zone.name) activeZone = null
    }
  }
  document.querySelector('.hero-intro')?.toggleAttribute('hidden', activeZone !== null || heroDismissed)
}

function updateInteractionHint() {
  const hint = document.getElementById('world-interaction') as HTMLButtonElement | null
  if (!hint) return
  if (pinnedZone) { activeInteraction = null; hint.hidden = true; return }
  const project = projectStations.nearest(car.position)
  if (project && project.distance < 18) {
    activeInteraction = { type: 'project', index: project.index }
    hint.textContent = t('interaction_prompt').replace('{name}', projectTitle(project.index))
    hint.hidden = false
    return
  }
  const nearestZone = zones
    .map(zone => ({ zone, distance: car.position.distanceTo(zone.pos) }))
    .filter(result => result.distance < result.zone.radius + 5)
    .sort((a, b) => a.distance - b.distance)[0]
  if (nearestZone) {
    activeInteraction = { type: 'zone', name: nearestZone.zone.name }
    hint.textContent = t('interaction_prompt').replace('{name}', t(zoneLabelKeys[nearestZone.zone.name as keyof typeof zoneLabelKeys]))
    hint.hidden = false
  } else {
    activeInteraction = null
    hint.hidden = true
  }
}

function activateInteraction() {
  if (!activeInteraction) return
  if (activeInteraction.type === 'project') activateProjectStation(activeInteraction.index)
  else revealZone(activeInteraction.name)
}

// ─── Populate Panels ──────────────────────────────────────────
function populateAboutPanel() {
  const container = document.getElementById('about-content')
  if (!container) return
  const githubUrl = safeExternalUrl(profile.githubUrl)
  container.innerHTML = `
    <img class="avatar" src="${escapeAttribute(safeMediaUrl(profile.avatarUrl) ?? '')}" alt="${escapeAttribute(profile.name)}" width="80" height="80" loading="lazy">
    <h2>${escapeAttribute(profile.name)}</h2>
    <p class="subtitle">${t('profile_title')}</p>
    <p class="bio">${t('profile_bio')}</p>
    <p class="location">📍 ${t('profile_location')}</p>
    <div class="links">
      ${githubUrl ? `<a href="${escapeAttribute(githubUrl)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ''}
      <a href="mailto:${encodeURIComponent(profile.email)}">${t('contact_email')}</a>
      <a href="${escapeAttribute(profile.linkedinUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${t('contact_linkedin')}">${t('contact_linkedin')}</a>
    </div>
  `
  const avatar = container.querySelector<HTMLImageElement>('.avatar')
  avatar?.addEventListener('error', () => { avatar.src = avatarFallback() }, { once: true })
}

function activateProjectStation(index: number) {
  soundEffects.play('open')
  showProjectDetails(index, true)
  openProjectDetails(index)
}

function showProjectDetails(index: number, cinematic: boolean) {
  if (!profile.projects[index]) return
  activeProjectIndex = index
  projectStations.setSelected(index)
  if (cinematic && !reducedMotion.matches) {
    cameraFocus.copy(projectStations.positions[index]).add(new THREE.Vector3(0, 3, 0))
    cameraFocusTime = 1.2
    const target = projectStations.positions[index].clone().add(new THREE.Vector3(0, 3, 0))
    setDirectedView(target.clone().add(new THREE.Vector3(0, 12, 23)), target, 1.6)
  }
  revealZone('projects')
  populateProjectsPanel()
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-project-index="${index}"]`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' })
  })
}

function populateProjectsPanel() {
  const container = document.getElementById('projects-content')
  if (!container) return
  container.innerHTML = `${projectFilterControls()}<div id="project-results" aria-live="polite" aria-atomic="false"></div>`
  renderProjectResults()
}

function populateSkillsPanel() {
  const container = document.getElementById('skills-content')
  if (!container) return

  const createSkillGroup = (title: string, items: string[]) => `
    <div class="skill-group">
      <h4>${title}</h4>
      <div class="skill-tags">
        ${items.map(s => `<span class="tag">${s}</span>`).join('')}
      </div>
    </div>
  `

  container.innerHTML = displayedSkillGroups().map(([title, items]) => createSkillGroup(t(title as any), items)).join('')
}

function populateExperiencePanel() {
  const container = document.getElementById('experience-content')
  if (!container) return

  let html = '<div class="timeline">'
  profile.experience.forEach(exp => {
    html += `
      <div class="timeline-item">
        <div class="timeline-header">
        <span class="role">${t('experience_role')}</span>
          <span class="period">${exp.period}</span>
        </div>
        <div class="org">${t('experience_org')}</div>
        <p class="desc">${t('experience_desc')}</p>
        <div class="technologies">
          ${exp.technologies.map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
    `
  })
  html += '</div>'
  container.innerHTML = html
}

function populateEducationPanel() {
  const container = document.getElementById('education-content')
  if (!container) return

  let html = ''
  profile.education.forEach(edu => {
    html += `
      <div class="edu-card">
        <h3>${t('education_degree')}</h3>
        <div class="institution">${t('education_institution')}</div>
        <div class="period">${t('education_period')}</div>
        <p class="desc">${t('education_desc')}</p>
      </div>
    `
  })
  container.innerHTML = html
}

function populateContactPanel() {
  const container = document.getElementById('contact-content')
  if (!container) return
  const githubUrl = safeExternalUrl(profile.githubUrl)

  container.innerHTML = `
    <div class="contact-item">
      <span class="icon">💻</span>
      <div>
        <strong>${t('contact_github')}</strong>
        ${githubUrl ? `<a href="${escapeAttribute(githubUrl)}" target="_blank" rel="noopener noreferrer">${escapeAttribute(githubUrl)}</a>` : ''}
      </div>
    </div>
    ${contactMethodsMarkup()}
    <div class="contact-form">
      <h3>${t('contact_send_message')}</h3>
      <form id="contact-form" aria-label="${t('contact_form_label')}">
        <label for="contact-name">${t('contact_name')}</label>
        <input id="contact-name" name="name" type="text" autocomplete="name" placeholder="${t('contact_name_placeholder')}" required>
        <label for="contact-email">${t('contact_email_input')}</label>
        <input id="contact-email" name="email" type="email" autocomplete="email" placeholder="${t('contact_email_placeholder')}" required>
        <label for="contact-message">${t('contact_body')}</label>
        <textarea id="contact-message" name="message" placeholder="${t('contact_message_placeholder')}" rows="4" required></textarea>
        <button type="submit">${t('contact_send')}</button>
      </form>
    </div>
  `
}

function contactMethodsMarkup() {
  return `<div class="contact-methods">
    <a class="contact-whatsapp contact-method" href="${escapeAttribute(profile.whatsappUrl)}" target="_blank" rel="noopener noreferrer"><svg class="contact-method-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 2 17.8L.5 23.5l5.9-1.5a11.8 11.8 0 0 0 14.1-18.5ZM12 21a9 9 0 0 1-4.6-1.3l-.3-.2-3.5.9.9-3.4-.2-.4A9 9 0 1 1 12 21Zm5-6.7c-.3-.2-1.7-.9-2-.9-.2-.1-.4-.2-.6.2l-.9 1c-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6l.4-.4.3-.5c.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.5-.5-.7-.5H7.8c-.2 0-.5.1-.8.4s-1 1-1 2.3 1 2.7 1.1 2.9c.2.2 2 3.1 4.8 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.1-1.4 0-.1-.2-.2-.5-.4Z"/></svg><span>${t('contact_whatsapp')}<small dir="ltr">${escapeAttribute(profile.whatsappNumber)}</small></span></a>
    <a class="contact-telegram contact-method" href="${escapeAttribute(profile.telegramUrl)}" target="_blank" rel="noopener noreferrer"><svg class="contact-method-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.8 3.2-3.3 17c-.2 1.2-.9 1.5-1.9.9l-5.3-3.9-2.6 2.5c-.3.3-.5.5-1 .5l.4-5.4 9.8-8.9c.4-.4-.1-.6-.6-.2L5.4 13.2.2 11.6c-1.1-.4-1.1-1.1.2-1.6L20.5 2c.9-.3 1.7.2 1.3 1.2Z"/></svg><span>${t('contact_telegram')}<small dir="ltr">${escapeAttribute(profile.telegramUsername)}</small></span></a>
    <a class="contact-email contact-method" href="mailto:${escapeAttribute(profile.email)}"><svg class="contact-method-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 8L3 7v10h18V7l-9 6Zm0-2.4L20.2 7H3.8l8.2 3.6Z"/></svg><span>${t('contact_email')}<small dir="ltr">${escapeAttribute(profile.email)}</small></span></a>
    <a class="contact-linkedin contact-method" href="${escapeAttribute(profile.linkedinUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${t('contact_linkedin')}"><svg class="contact-method-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.35V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.264 2.37 4.264 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 .001-4.125 2.062 2.062 0 0 1-.001 4.125zM3.555 9h3.564v11.452H3.555z"/></svg><span>${t('contact_linkedin')}<small dir="ltr">linkedin.com/in/mahamed-yasser-00b43a392</small></span></a>
    <a class="contact-github contact-method" href="https://github.com/mahamed-yasser" target="_blank" rel="noopener noreferrer"><svg class="contact-method-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.08c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.16 1.71 1.16 1 1.71 2.62 1.22 3.26.93.1-.72.39-1.22.71-1.5-2.47-.28-5.07-1.24-5.07-5.51 0-1.22.44-2.21 1.16-2.99-.12-.28-.5-1.42.11-2.96 0 0 .95-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.11-1.43 3.05-1.14 3.05-1.14.61 1.54.23 2.68.11 2.96.72.78 1.16 1.77 1.16 2.99 0 4.28-2.61 5.22-5.09 5.5.4.35.76 1.03.76 2.08V22c0 .29.2.63.77.53A11.1 11.1 0 0 0 12 .9Z"/></svg><span>GitHub<small dir="ltr">github.com/mahamed-yasser</small></span></a>
  </div>`
}

function populateClassicContact() {
  const container = document.getElementById('classic-contact-details')
  if (!container) return
  container.innerHTML = contactMethodsMarkup()
}

function populateClassicView() {
  const filterContainer = document.getElementById('classic-project-filters')
  if (filterContainer) filterContainer.innerHTML = projectFilterControls()
  const projectsContainer = document.getElementById('classic-projects')
  if (projectsContainer) renderProjectResults()

  const skillsContainer = document.getElementById('classic-skills')
  if (skillsContainer) {
    skillsContainer.innerHTML = displayedSkillGroups().map(([title, items]) => `
      <div class="skill-group">
        <h4>${t(title as any)}</h4>
        <div class="skill-tags">${items.map(s => `<span class="tag">${s}</span>`).join('')}</div>
      </div>
    `).join('')
  }

  const experienceContainer = document.getElementById('classic-experience')
  if (experienceContainer) {
    experienceContainer.innerHTML = profile.experience.map(exp => `
      <div class="timeline-item">
        <div class="timeline-header">
        <span class="role">${t('experience_role')}</span>
          <span class="period">${exp.period}</span>
        </div>
        <div class="org">${t('experience_org')}</div>
        <p class="desc">${t('experience_desc')}</p>
      </div>
    `).join('')
  }

  const educationContainer = document.getElementById('classic-education')
  if (educationContainer) {
    educationContainer.innerHTML = profile.education.map(() => `
      <article class="edu-card">
        <h3>${t('education_degree')}</h3>
        <div class="institution">${t('education_institution')}</div>
        <div class="period">${t('education_period')}</div>
        <p class="desc">${t('education_desc')}</p>
      </article>
    `).join('')
  }

  const achievementsContainer = document.getElementById('classic-achievements')
  if (achievementsContainer) {
    const state = achievements.getState()
    achievementsContainer.innerHTML = ACHIEVEMENTS.map(item => {
      const unlocked = state.unlocked.has(item.id)
      const totals = achievements.getTotals()
      const count = item.id === 'explorer' ? totals.zones : item.id === 'ring_master' ? Math.ceil(totals.rings * 0.75) : item.id === 'collector' ? totals.rings : 0
      const description = t(`achievement_desc_${item.id}` as any).replaceAll('{count}', String(count))
      return `<article class="achievement-card ${unlocked ? 'won' : 'locked'}"><span class="ach-icon" aria-hidden="true">${item.icon}</span><div class="ach-info"><span class="ach-name">${t(`achievement_name_${item.id}` as any)}</span><span class="ach-desc">${description}</span></div><span class="ach-check" aria-label="${unlocked ? t('achievement_unlocked') : t('achievement_locked')}">${unlocked ? '✓' : '·'}</span></article>`
    }).join('')
  }
  populateClassicContact()
}

function populateAchievementsPanel() {
  const container = document.getElementById('achievements-content')
  if (!container) return
  const state = achievements.getState()
  container.innerHTML = ACHIEVEMENTS.map(item => {
    const unlocked = state.unlocked.has(item.id)
    const count = item.id === 'explorer' ? achievements.getTotals().zones : item.id === 'ring_master' ? Math.ceil(achievements.getTotals().rings * 0.75) : item.id === 'collector' ? achievements.getTotals().rings : 0
    const description = t(`achievement_desc_${item.id}` as any).replaceAll('{count}', String(count))
    return `<article class="achievement-card ${unlocked ? 'won' : 'locked'}"><span class="ach-icon" aria-hidden="true">${item.icon}</span><div class="ach-info"><span class="ach-name">${t(`achievement_name_${item.id}` as any)}</span><span class="ach-desc">${description}</span></div><span class="ach-check" aria-label="${unlocked ? t('achievement_unlocked') : t('achievement_locked')}">${unlocked ? '✓' : '·'}</span></article>`
  }).join('')
}

// Initialize all panels
populateAboutPanel()
populateProjectsPanel()
populateSkillsPanel()
populateExperiencePanel()
populateEducationPanel()
populateContactPanel()
populateClassicView()
populateAchievementsPanel()
initializeClassicScrollPolish()

document.addEventListener('localechange', () => {
  populateAboutPanel()
  populateProjectsPanel()
  populateSkillsPanel()
  populateExperiencePanel()
  populateEducationPanel()
  populateContactPanel()
  populateClassicView()
  populateAchievementsPanel()
  syncProjectFilterValues()
  zones.forEach(zone => {
    zone.paintLabel()
    zone.labelTexture.needsUpdate = true
  })
  projectStations.refreshLabels(projectTitle)
})
achievements.onChange(() => { populateClassicView(); populateAchievementsPanel() })

document.addEventListener('input', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || target.dataset.projectFilter !== 'search') return
  projectFilters.search = target.value
  syncProjectFilterValues()
  renderProjectResults()
})
document.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLSelectElement) || !target.dataset.projectFilter) return
  const field = target.dataset.projectFilter as 'category' | 'technology' | 'sort'
  projectFilters[field] = target.value
  syncProjectFilterValues()
  renderProjectResults()
})

// The portfolio is static, so send contact form submissions through the
// visitor's configured email app instead of silently posting to a missing API.
document.addEventListener('submit', event => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || form.id !== 'contact-form') return

  event.preventDefault()
  const fields = new FormData(form)
  const subject = `Portfolio message from ${String(fields.get('name') ?? '').trim()}`
  const body = [
    `Name: ${String(fields.get('name') ?? '').trim()}`,
    `Email: ${String(fields.get('email') ?? '').trim()}`,
    '',
    String(fields.get('message') ?? '').trim()
  ].join('\n')
  window.location.href = `mailto:${profile.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
})

// ─── Minimap ──────────────────────────────────────────────────
const mmCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement
if (mmCanvas) {
  mmCanvas.width = 160
  mmCanvas.height = 160
}
const mmCtx = mmCanvas?.getContext('2d')

function drawMinimap() {
  if (!mmCtx) return
  mmCtx.clearRect(0, 0, 160, 160)
  mmCtx.fillStyle = 'rgba(9, 7, 27, 0.95)'
  mmCtx.fillRect(0, 0, 160, 160)

  const scale = 0.38
  const cx = 80, cy = 80

  zones.forEach(zone => {
    const dx = (zone.pos.x - car.position.x) * scale + cx
    const dz = (zone.pos.z - car.position.z) * scale + cy
    mmCtx.fillStyle = '#' + zone.color.toString(16).padStart(6, '0')
    mmCtx.beginPath()
    mmCtx.arc(dx, dz, 7, 0, Math.PI * 2)
    mmCtx.fill()
  })

  // Draw car as triangle
  mmCtx.save()
  mmCtx.translate(cx, cy)
  // The car faces world +Z at yaw 0, which maps to screen-down on this
  // minimap. Canvas angles rotate clockwise while the marker points up by
  // default, so convert world yaw to the equivalent screen angle.
  mmCtx.rotate(Math.PI - car.group.rotation.y)
  mmCtx.fillStyle = '#00d4ff'
  mmCtx.beginPath()
  mmCtx.moveTo(0, -8)
  mmCtx.lineTo(6, 6)
  mmCtx.lineTo(-6, 6)
  mmCtx.closePath()
  mmCtx.fill()
  mmCtx.restore()
}

// ─── Project Station Interaction ─────────────────────────────
renderer.domElement.addEventListener('click', (e) => {
  if (performance.now() < suppressCanvasClickUntil) return
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const stationHit = raycaster.intersectObjects(projectStations.targets, false)[0]
  if (stationHit) {
    const projectIndex = projectStations.projectIndexFromHit(stationHit)
    if (typeof projectIndex === 'number') activateProjectStation(projectIndex)
    return
  }
})

renderer.domElement.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)

  const stationHit = raycaster.intersectObjects(projectStations.targets, false)[0]
  let hovering = Boolean(stationHit)
  projectStations.setHovered(projectStations.projectIndexFromHit(stationHit) ?? -1)
  renderer.domElement.style.cursor = hovering ? 'pointer' : 'default'
})

// ─── Animation Loop ───────────────────────────────────────────
const clock = new THREE.Clock()
let lastAchievementDistance = car.distanceTraveled
const resolutionSteps = [1, 0.85, 0.7]
let resolutionStep = 0
let fpsSampleTime = 0
let fpsSampleFrames = 0
let lowFpsSamples = 0
let resolutionRecoveryTime = 0
let animationFrameId = 0

function adjustMobileResolution(frameDelta: number) {
  if (!mobileViewport || frameDelta > 0.25) return
  fpsSampleTime += frameDelta
  fpsSampleFrames++
  if (fpsSampleTime < 1) return

  const fps = fpsSampleFrames / fpsSampleTime
  let changed = false
  if (fps < 38) {
    lowFpsSamples++
    resolutionRecoveryTime = 0
    if (lowFpsSamples >= 4 && resolutionStep < resolutionSteps.length - 1) {
      resolutionStep++
      lowFpsSamples = 0
      changed = true
    }
  } else if (fps > 55 && resolutionStep > 0) {
    lowFpsSamples = 0
    resolutionRecoveryTime += fpsSampleTime
    if (resolutionRecoveryTime >= 6) {
      resolutionStep--
      resolutionRecoveryTime = 0
      changed = true
    }
  } else {
    lowFpsSamples = 0
    resolutionRecoveryTime = 0
  }

  if (changed) {
    const viewport = getViewportBounds()
    updateDrawingBufferSize(viewport.width, viewport.height, Math.min(window.devicePixelRatio, pixelRatioLimit()) * resolutionSteps[resolutionStep])
  }
  fpsSampleTime = 0
  fpsSampleFrames = 0
}

function animate() {
  if (document.hidden || document.getElementById('classic-view')?.classList.contains('active')) {
    animationFrameId = 0
    clock.stop()
    Object.keys(keys).forEach(code => { keys[code] = false })
    resetDrivePointer()
    releaseBoost()
    return
  }
  animationFrameId = requestAnimationFrame(animate)
  // Avoid a large physics step after returning from a background tab.
  const frameDelta = clock.getDelta()
  const delta = Math.min(frameDelta, 0.05)
  adjustMobileResolution(frameDelta)
  const time = clock.elapsedTime
  updateWorldPreset(delta)

  if (experienceMode !== 'free' && tourSteps.length) {
    tourElapsed += delta
    const step = tourSteps[tourStep]
    const caption = document.getElementById('tour-caption')
    if (caption && step) caption.textContent = step.label
    if (experienceMode === 'cinematic' && tourElapsed >= 8.5) {
      tourStep = (tourStep + 1) % tourSteps.length
      moveTourToStep()
    }
  }

  const ctrl = getControls()
  car.update(delta, ctrl)
  const drivenDistance = Math.max(0, car.distanceTraveled - lastAchievementDistance)
  if (drivenDistance > 0) achievements.addDistance(drivenDistance)
  lastAchievementDistance = car.distanceTraveled
  ringsField?.collectRings(car.position, event => achievements.recordRing(event.id))
  car.handleRampCollisions(ramps, delta)
  updateCamera(delta)
  checkZones()
  updateInteractionHint()
  drawMinimap()
  // Animate zones floating
  if (!reducedMotion.matches) {
    zones.forEach((z, i) => { z.group.position.y = Math.sin(time * 1.5 + i) * 0.25 })
    projectStations.update(time)
    centralHub.update(time)
  }

  // Update synthwave world
  synthwaveWorld.update(time)

  // Animate spaceships
  ships.forEach(ship => ship.update(delta))

  // Animate mini-game rings
  rings.forEach(ring => ring.update(delta))

  renderer.render(scene, camera)
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
    clock.stop()
    Object.keys(keys).forEach(code => { keys[code] = false })
    resetDrivePointer()
    releaseBoost()
  } else {
    clock.start()
    animate()
  }
})
animate()
scheduleSecondaryWorldSystems()

// ─── Resize Handler ───────────────────────────────────────────
function resizeViewport() {
  mobileViewport = window.matchMedia('(pointer: coarse), (max-width: 760px)').matches
  if (!mobileViewport) resolutionStep = 0
  const viewport = getViewportBounds()
  camera.fov = mobileViewport ? (viewport.height > viewport.width ? 76 : 68) : 60
  document.documentElement.style.setProperty('--visual-viewport-height', `${viewport.height}px`)
  camera.aspect = viewport.width / viewport.height
  camera.updateProjectionMatrix()
  renderer.shadowMap.enabled = !mobileViewport
  updateDrawingBufferSize(viewport.width, viewport.height, Math.min(window.devicePixelRatio, pixelRatioLimit()) * resolutionSteps[resolutionStep])
}

let resizeFrame = 0
function scheduleViewportResize() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    resizeViewport()
  })
}
window.addEventListener('resize', scheduleViewportResize, { passive: true })
window.addEventListener('orientationchange', scheduleViewportResize, { passive: true })
window.visualViewport?.addEventListener('resize', scheduleViewportResize, { passive: true })
window.addEventListener('pagehide', () => soundEffects.dispose(), { once: true })

// ─── Loading Screen ───────────────────────────────────────────
setTimeout(() => {
  document.getElementById('loading')?.classList.add('hidden')
}, 800)

// ─── Language Toggle ──────────────────────────────────────────

function revealZone(name: string) {
  window.closeZone()
  heroDismissed = true
  pinnedZone = name
  dismissedZone = null
  activeZone = name
  document.getElementById(`zone-${name}`)?.classList.add('active')
  document.querySelector('.hero-intro')?.setAttribute('hidden', '')
}
document.getElementById('hero-explore')?.addEventListener('click', () => {
  heroDismissed = true
  document.querySelector('.hero-intro')?.setAttribute('hidden', '')
  car.reset()
})
document.getElementById('hero-projects')?.addEventListener('click', () => revealZone('projects'))
document.getElementById('world-interaction')?.addEventListener('click', activateInteraction)
window.addEventListener('keydown', event => {
  const phaseThreeOpen = document.querySelector('#assistant-panel:not([hidden]), #terminal-panel:not([hidden]), #recruiter-panel:not([hidden]), #project-detail-panel:not([hidden]), #project-gallery-viewer:not([hidden])') !== null
  if (event.code !== 'KeyE' || isEditableTarget(event.target) || phaseThreeOpen || document.getElementById('classic-view')?.classList.contains('active')) return
  if (!activeInteraction) return
  event.preventDefault()
  activateInteraction()
})

// ─── Classic View ─────────────────────────────────────────────
window.show3D = () => {
  const classic = document.getElementById('classic-view')
  if (classic) { classic.classList.remove('active'); classic.inert = true }
  const hud = document.getElementById('hud')
  if (hud) { hud.style.display = ''; hud.inert = false }
  if (!document.hidden && animationFrameId === 0) {
    clock.start()
    animate()
  }
}

window.closeZone = () => {
  if (activeZone) dismissedZone = activeZone
  pinnedZone = null
  document.querySelectorAll<HTMLElement>('.zone-panel').forEach(p => { p.classList.remove('active'); p.inert = true; p.setAttribute('aria-hidden', 'true') })
  activeZone = null
  document.querySelector('.hero-intro')?.toggleAttribute('hidden', heroDismissed)
}

document.querySelectorAll<HTMLButtonElement>('[data-close-zone]').forEach(button => button.addEventListener('click', () => window.closeZone()))
const achievementsPanel = document.getElementById('ach-panel')
const achievementsButton = document.getElementById('ach-btn')
function toggleAchievements() {
  const open = achievementsPanel?.classList.toggle('active') ?? false
  if (achievementsPanel) { achievementsPanel.inert = !open; achievementsPanel.setAttribute('aria-hidden', String(!open)) }
  achievementsButton?.setAttribute('aria-expanded', String(open))
  if (!open && document.activeElement === document.getElementById('achievements-close')) achievementsButton?.focus()
}
achievementsButton?.addEventListener('click', toggleAchievements)
document.getElementById('achievements-close')?.addEventListener('click', toggleAchievements)
const classicAvatar = document.getElementById('classic-avatar') as HTMLImageElement | null
classicAvatar?.addEventListener('error', () => { classicAvatar.src = avatarFallback() }, { once: true })

function navigateFromTools(section: SectionName, projectIndex?: number) {
  const classicOpen = document.getElementById('classic-view')?.classList.contains('active')
  if (classicOpen) {
    if (projectIndex !== undefined) {
      projectFilters.search = ''
      projectFilters.category = 'all'
      projectFilters.technology = 'all'
      projectFilters.sort = 'featured'
      activeProjectIndex = projectIndex
      projectStations.setSelected(projectIndex)
      syncProjectFilterValues()
      renderProjectResults()
    }
    requestAnimationFrame(() => {
      const target = projectIndex === undefined
        ? document.getElementById(section)
        : document.querySelector<HTMLElement>(`#classic-projects [data-project-index="${projectIndex}"]`)
      if (target) {
        target.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' })
        target.tabIndex = -1
        target.focus({ preventScroll: true })
      }
    })
    return
  }
  if (section === 'achievements') {
    document.getElementById('ach-btn')?.click()
  } else if (section === 'projects' && projectIndex !== undefined) {
    showProjectDetails(projectIndex, false)
  } else {
    revealZone(section)
  }
  requestAnimationFrame(() => {
    const target = section === 'achievements'
      ? document.getElementById('ach-panel')
      : document.getElementById(`zone-${section}`)
    if (target) {
      target.tabIndex = -1
      target.focus({ preventScroll: true })
    }
  })
}

let phaseThreeMounted = false
let phaseThreePromise: Promise<void> | null = null
function ensurePhaseThree(): Promise<void> {
  if (phaseThreeMounted) return Promise.resolve()
  if (!phaseThreePromise) {
    phaseThreePromise = import('./ui/phase-three.js').then(({ mountPhaseThree }) => {
      mountPhaseThree({ navigate: navigateFromTools, openProject: index => { showProjectDetails(index, false); openProjectDetails(index) } })
      phaseThreeMounted = true
    }).catch(error => {
      phaseThreePromise = null
      throw error
    })
  }
  return phaseThreePromise
}
document.querySelectorAll<HTMLButtonElement>('#experience-menu-trigger, #experience-menu-trigger-classic').forEach(trigger => {
  trigger.addEventListener('click', event => {
    if (phaseThreeMounted) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void ensurePhaseThree().then(() => trigger.click(), error => console.error('Portfolio tools could not be loaded.', error))
  }, { capture: true })
})

document.getElementById('hero-explore')?.removeAttribute('disabled')
document.getElementById('hero-projects')?.removeAttribute('disabled')
document.getElementById('back-to-3d')?.removeAttribute('hidden')
document.getElementById('experience-menu-trigger-classic')?.removeAttribute('hidden')

console.log('🚀 Synthwave Portfolio Ready! Drive with WASD/Arrows')
