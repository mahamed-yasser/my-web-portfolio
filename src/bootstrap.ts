import { initI18n, t } from './i18n/index.js'
import { ProjectShowcase } from './ui/project-showcase.js'

let projectShowcase: ProjectShowcase | undefined

export function openProjectDetails(index: number): void {
  projectShowcase ??= new ProjectShowcase()
  projectShowcase.open(index)
}

// Project case studies are available independently of the deferred 3D engine.
document.addEventListener('click', event => {
  const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-open-project]') : null
  if (trigger) openProjectDetails(Number(trigger.dataset.openProject))
})

// The route determines locale; both routes already contain localized HTML.
initI18n()
const sectionIds = new Set(['about', 'projects', 'skills', 'experience', 'education', 'achievements', 'contact'])
const sectionFromHash = window.location.hash.slice(1)
const want3D = sectionFromHash === '3d' || new URLSearchParams(window.location.search).get('view') === '3d'
let classicSelectedBefore3D = !want3D
if (classicSelectedBefore3D) {
  document.getElementById('classic-view')?.classList.add('active')
  const classic = document.getElementById('classic-view')
  if (classic) classic.inert = false
  const hud = document.getElementById('hud')
  if (hud) { hud.style.display = 'none'; hud.inert = true }
  document.getElementById('loading')?.classList.add('hidden')
  document.getElementById('back-to-3d')?.removeAttribute('hidden')
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (sectionIds.has(sectionFromHash)) document.getElementById(sectionFromHash)?.scrollIntoView({ block: 'start' })
  }))
}

const switchLocale = (locale: 'en' | 'ar') => {
  const current = window.location.pathname === '/ar' || window.location.pathname.startsWith('/ar/') ? 'ar' : 'en'
  if (locale === current) return
  const section = window.location.hash.slice(1)
  const hash = sectionIds.has(section) ? `#${section}` : ''
  window.location.assign(`${locale === 'ar' ? '/ar/' : '/'}${hash}`)
}
document.getElementById('lang-btn-en')?.addEventListener('click', () => switchLocale('en'))
document.getElementById('lang-btn-ar')?.addEventListener('click', () => switchLocale('ar'))

let mainLoad: Promise<void> | null = null
function loadMain(): Promise<void> {
  if (!mainLoad) mainLoad = import('./main.js').then(() => undefined).catch(show3DFallback)
  return mainLoad
}

document.getElementById('back-to-3d')?.addEventListener('click', () => {
  classicSelectedBefore3D = false
  const show3D = (window as Window & { show3D?: () => void }).show3D
  if (show3D) {
    show3D()
    return
  }

  const classic = document.getElementById('classic-view')
  if (classic) { classic.classList.remove('active'); classic.inert = true }
  const hud = document.getElementById('hud')
  if (hud) { hud.style.display = ''; hud.inert = false }
  document.getElementById('loading')?.classList.remove('hidden')
  void loadMain()
})

document.querySelectorAll<HTMLButtonElement>('.skip-btn').forEach(button => {
  button.addEventListener('click', () => {
    classicSelectedBefore3D = true
    document.getElementById('classic-view')?.classList.add('active')
    const classic = document.getElementById('classic-view')
    if (classic) classic.inert = false
    const hud = document.getElementById('hud')
    if (hud) { hud.style.display = 'none'; hud.inert = true }
    document.getElementById('loading')?.classList.add('hidden')
    document.getElementById('back-to-3d')?.removeAttribute('hidden')
    requestAnimationFrame(() => classic?.dispatchEvent(new Event('scroll')))
  }, { capture: true })
})

export function show3DFallback(error: unknown): void {
  console.error('The interactive 3D portfolio could not be initialized.', error)

  const hud = document.getElementById('hud')
  if (hud) {
    hud.style.display = 'none'
    hud.inert = true
  }

  const classic = document.getElementById('classic-view')
  if (classic) {
    classic.classList.add('active')
    classic.inert = false
  }
  document.getElementById('back-to-3d')?.setAttribute('hidden', '')

  const status = document.getElementById('startup-status')
  if (status) {
    status.textContent = t('no_webgl')
    status.hidden = false
  }
  document.getElementById('loading')?.classList.add('hidden')
}

// Let the browser paint the complete, semantic HTML before loading Three.js and
// constructing the world. Two frames also give the initial CSS/layout a chance
// to settle on slower mobile devices.
const start3D = () => {
  if (!classicSelectedBefore3D) void loadMain()
}
requestAnimationFrame(() => requestAnimationFrame(() => {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  }
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(start3D, { timeout: 1000 })
  else window.setTimeout(start3D, 0)
}))

