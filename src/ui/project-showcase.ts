import './project-showcase.css'
import { profile } from '../data/profile.js'
import { getLocale, t } from '../i18n/index.js'

const tr = (key: string, values: Record<string, string> = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement), t(key as any))
const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const safeMedia = (value: string) => { try { const url = new URL(value, window.location.href); return url.protocol === 'https:' || url.origin === window.location.origin ? url.href : null } catch { return null } }
const safeExternal = (value: string) => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null } catch { return null } }

export class ProjectShowcase {
  private dialog = document.getElementById('project-detail-panel') as HTMLElement
  private viewer = document.getElementById('project-gallery-viewer') as HTMLElement
  private content = document.getElementById('project-detail-content') as HTMLElement
  private closeButton = document.getElementById('project-detail-close') as HTMLButtonElement
  private galleryIndex = 0
  private images: string[] = []
  private previousFocus: HTMLElement | null = null
  private touchX = 0

  constructor() {
    this.closeButton.addEventListener('click', () => this.close())
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) this.close() })
    document.getElementById('project-gallery-close')?.addEventListener('click', () => this.closeViewer())
    document.getElementById('project-gallery-prev')?.addEventListener('click', () => this.showImage(this.galleryIndex - 1))
    document.getElementById('project-gallery-next')?.addEventListener('click', () => this.showImage(this.galleryIndex + 1))
    const image = document.getElementById('project-gallery-image') as HTMLImageElement
    image.addEventListener('error', () => { image.hidden = true; const fallback = document.getElementById('project-gallery-error'); if (fallback) fallback.hidden = false })
    image.addEventListener('load', () => { image.hidden = false; const fallback = document.getElementById('project-gallery-error'); if (fallback) fallback.hidden = true })
    image.addEventListener('touchstart', event => { this.touchX = event.changedTouches[0]?.clientX ?? 0 }, { passive: true })
    image.addEventListener('touchend', event => { const delta = (event.changedTouches[0]?.clientX ?? this.touchX) - this.touchX; if (Math.abs(delta) > 45) this.showImage(this.galleryIndex + (delta < 0 ? 1 : -1)) }, { passive: true })
    this.content.addEventListener('error', event => {
      const target = event.target
      if (!(target instanceof HTMLImageElement) || !target.closest('.project-media-thumb')) return
      target.parentElement!.textContent = tr('project_media_error')
      target.parentElement!.classList.add('project-media-thumb-error')
    }, true)
    document.addEventListener('keydown', event => {
      if (!this.viewer.hidden) {
        if (event.key === 'Escape') { event.preventDefault(); this.closeViewer() }
        else if (event.key === 'ArrowRight') { event.preventDefault(); this.showImage(this.galleryIndex + (getLocale() === 'ar' ? -1 : 1)) }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); this.showImage(this.galleryIndex + (getLocale() === 'ar' ? 1 : -1)) }
        else if (event.key === 'Tab') this.trapViewerFocus(event)
        event.stopPropagation()
      } else if (!this.dialog.hidden) {
        if (event.key === 'Escape') { event.preventDefault(); this.close() }
        else if (event.key === 'Tab') this.trapFocus(event)
      }
    }, true)
    document.addEventListener('localechange', () => { if (!this.dialog.hidden) this.render(this.currentIndex) })
  }

  private currentIndex = 0
  open(index: number) {
    if (!profile.projects[index]) return
    if (this.dialog.hidden) this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.currentIndex = index
    this.render(index)
    this.dialog.hidden = false
    document.dispatchEvent(new CustomEvent('phase3:modal-open'))
    requestAnimationFrame(() => this.closeButton.focus())
  }

  close() {
    this.closeViewer()
    this.dialog.hidden = true
    this.previousFocus?.focus()
  }

  private render(index: number) {
    const project = profile.projects[index]
    const title = t(`project_title_${index}` as any)
    const media = [...new Set([...(project.image ? [project.image] : []), ...(project.screenshots ?? [])].map(safeMedia).filter((value): value is string => value !== null))]
    const githubUrl = safeExternal(project.githubUrl)
    const liveUrl = safeExternal(project.liveUrl ?? '')
    this.images = media
    const optional = (key: string, value?: string | string[]) => {
      if (!value || (Array.isArray(value) && !value.length)) return ''
      const content = Array.isArray(value) ? `<ul>${value.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p>${esc(value)}</p>`
      return `<section class="case-study-section"><h3>${tr(key)}</h3>${content}</section>`
    }
    const related = profile.projects.map((candidate, candidateIndex) => ({ candidate, candidateIndex, shared: candidate.techStack.filter(tech => project.techStack.includes(tech)) })).filter(item => item.candidateIndex !== index && item.shared.length)
    this.content.innerHTML = `<div class="project-detail-hero"><div><p class="project-detail-eyebrow">${project.featured ? `<span class="project-featured">${t('projects_featured' as any)}</span>` : ''}<span>${t(`project_category_${project.category}` as any)}</span></p><h2 id="project-detail-title">${esc(title)}</h2></div><div class="project-detail-links">${githubUrl ? `<a href="${esc(githubUrl)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>` : ''}${liveUrl ? `<a href="${esc(liveUrl)}" target="_blank" rel="noopener noreferrer">${t('view_live_demo' as any)} ↗</a>` : ''}</div></div>
      <section class="case-study-section"><h3>${tr('project_overview')}</h3><p>${esc(t(`project_desc_${index}` as any))}</p><p>${esc(t(`project_long_description_${index}` as any))}</p></section>
      ${optional('project_problem', project.problem)}${optional('project_solution', project.solution)}${optional('project_approach', project.approach)}${optional('project_technical_implementation', project.technicalImplementation)}${optional('project_responsibilities', project.responsibilities)}
      <section class="case-study-section"><h3>${tr('project_technologies')}</h3><div class="tech-stack">${project.techStack.map(tech => `<span class="tag">${esc(tech)}</span>`).join('')}</div></section>
      ${optional('project_challenges', project.challenges)}${optional('project_results', project.results)}
      <section class="case-study-section"><h3>${tr('project_media')}</h3>${media.length ? `<div class="project-media-grid">${media.map((src, imageIndex) => `<button type="button" class="project-media-thumb" data-gallery-index="${imageIndex}" aria-label="${esc(`${tr('project_view_screenshot')}: ${title}`)}"><img src="${esc(src)}" alt="${esc(title)}" loading="lazy" decoding="async"></button>`).join('')}</div>` : `<div class="project-media-empty">${tr('project_media_empty')}</div>`}</section>
      ${related.length ? `<section class="case-study-section"><h3>${tr('project_related')}</h3><div class="related-projects">${related.map(item => `<button type="button" class="related-project" data-related-index="${item.candidateIndex}"><strong>${esc(t(`project_title_${item.candidateIndex}` as any))}</strong><span>${tr('project_related_tech')}: ${item.shared.map(esc).join(' · ')}</span></button>`).join('')}</div></section>` : ''}`
    this.content.querySelectorAll<HTMLButtonElement>('[data-gallery-index]').forEach(button => button.addEventListener('click', () => this.openViewer(Number(button.dataset.galleryIndex))))
    this.content.querySelectorAll<HTMLButtonElement>('[data-related-index]').forEach(button => button.addEventListener('click', () => this.open(Number(button.dataset.relatedIndex))))
  }

  private openViewer(index: number) { if (!this.images.length) return; this.viewer.hidden = false; this.showImage(index); (document.getElementById('project-gallery-close') as HTMLButtonElement).focus() }
  private closeViewer() { this.viewer.hidden = true; if (!this.dialog.hidden) this.closeButton.focus() }
  private showImage(index: number) {
    if (!this.images.length) return
    this.galleryIndex = (index + this.images.length) % this.images.length
    const image = document.getElementById('project-gallery-image') as HTMLImageElement
    image.hidden = false
    image.src = this.images[this.galleryIndex]
    image.alt = `${t(`project_title_${this.currentIndex}` as any)} · ${this.galleryIndex + 1}`
    const fallback = document.getElementById('project-gallery-error'); if (fallback) fallback.hidden = true
    const count = document.getElementById('project-gallery-count'); if (count) count.textContent = tr('project_gallery_count', { current: String(this.galleryIndex + 1), total: String(this.images.length) })
  }
  private trapFocus(event: KeyboardEvent) {
    const focusable = [...this.dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')].filter(node => node.offsetParent !== null)
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  private trapViewerFocus(event: KeyboardEvent) {
    const focusable = [...this.viewer.querySelectorAll<HTMLElement>('button:not([disabled])')]
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
}

