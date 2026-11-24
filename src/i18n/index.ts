import en from './locales/en.json'
import ar from './locales/ar.json'

type LocaleKey = keyof typeof en
type Locale = 'en' | 'ar'
const locales: Record<Locale, typeof en> = { en, ar }
let current: Locale = 'en'

function updateMetadata(lang: Locale) {
  const dictionary = locales[lang]
  document.title = dictionary.meta_title
  const content = (selector: string, value: string) => document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value)
  content('meta[name="description"]', dictionary.meta_description)
  content('meta[property="og:title"]', dictionary.meta_title)
  content('meta[property="og:description"]', dictionary.meta_description)
  content('meta[name="twitter:title"]', dictionary.meta_title)
  content('meta[name="twitter:description"]', dictionary.meta_description)
  content('meta[name="twitter:image:alt"]', dictionary.og_image_alt)
  content('meta[property="og:image:alt"]', dictionary.og_image_alt)
  content('meta[property="og:locale"]', lang === 'ar' ? 'ar_EG' : 'en_US')
  const schema = document.getElementById('portfolio-schema')
  if (schema) {
    const data = JSON.parse(schema.textContent || '{}')
    const graph = data['@graph'] as Array<Record<string, any>> | undefined
    const person = graph?.find(entry => entry['@type'] === 'Person')
    if (person) person.description = dictionary.meta_description
    const page = graph?.find(entry => entry['@type'] === 'WebPage')
    if (page) {
      page.name = dictionary.meta_title
      page.description = dictionary.meta_description
      page.inLanguage = lang
    }
    schema.textContent = JSON.stringify(data)
  }
}

export function setLocale(lang: Locale, persist = true) {
  current = lang
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const value = locales[lang][el.dataset.i18n as LocaleKey]
    if (value) el.textContent = value
  })
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]').forEach(el => {
    const value = locales[lang][el.dataset.i18nPlaceholder as LocaleKey]
    if (value) el.placeholder = value
  })
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach(el => {
    const value = locales[lang][el.dataset.i18nAriaLabel as LocaleKey]
    if (value) el.setAttribute('aria-label', value)
  })
  document.getElementById('lang-btn-en')?.setAttribute('aria-pressed', String(lang === 'en'))
  document.getElementById('lang-btn-ar')?.setAttribute('aria-pressed', String(lang === 'ar'))
  document.getElementById('lang-btn-en')?.classList.toggle('active', lang === 'en')
  document.getElementById('lang-btn-ar')?.classList.toggle('active', lang === 'ar')
  updateMetadata(lang)
  document.dispatchEvent(new CustomEvent('localechange', { detail: { locale: lang } }))
  if (persist) {
    try { localStorage.setItem('locale', lang) } catch { /* Storage is optional. */ }
  }
}

export function t(key: LocaleKey): string { return locales[current][key] ?? key }
export function getLocale(): Locale { return current }

export function initI18n() {
  setLocale(window.location.pathname === '/ar' || window.location.pathname.startsWith('/ar/') ? 'ar' : 'en', false)
}

export { locales }
export type { LocaleKey }

