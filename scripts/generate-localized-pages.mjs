import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = resolve(root, 'dist')
const origin = 'https://mahamed-yasser-3d.pages.dev'
const en = JSON.parse(await readFile(resolve(root, 'src/i18n/locales/en.json'), 'utf8'))
const ar = JSON.parse(await readFile(resolve(root, 'src/i18n/locales/ar.json'), 'utf8'))
let html = await readFile(resolve(dist, 'index.html'), 'utf8')

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character])

function replaceAttribute(tag, attribute, expected, value, context) {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(\\s${escapedAttribute}=")([^"]*)(")`, 'gi')
  const matches = [...tag.matchAll(pattern)]
  if (matches.length !== 1 || matches[0][2] !== expected) {
    throw new Error(`Expected exactly one ${attribute}="${expected}" in ${context}; found ${matches.length}.`)
  }
  return tag.replace(pattern, (_match, before, _oldValue, after) => `${before}${escapeHtml(value)}${after}`)
}

function replaceTag(htmlSource, selector, tagName, attribute, value, context) {
  const tags = [...htmlSource.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))]
  const matches = tags.filter(([tag]) => selector(tag))
  if (matches.length !== 1) throw new Error(`Expected exactly one ${context}; found ${matches.length}.`)
  const [tag] = matches[0]
  const updated = replaceAttribute(tag, attribute.name, attribute.value, value, context)
  return htmlSource.replace(tag, updated)
}

// Set content on exactly one matching meta tag; requiring the existing content
// attribute avoids silently emitting a partially localized head.
function setMetaContent(htmlSource, attribute, name, value) {
  const namePattern = new RegExp(`\\s${attribute}="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i')
  const tags = [...htmlSource.matchAll(/<meta\b[^>]*>/gi)]
  const matches = tags.filter(([tag]) => namePattern.test(tag))
  if (matches.length !== 1) throw new Error(`Expected exactly one <meta ${attribute}="${name}">; found ${matches.length}.`)
  const [tag] = matches[0]
  const contentMatches = [...tag.matchAll(/\scontent="([^"]*)"/gi)]
  if (contentMatches.length !== 1) throw new Error(`Expected one content attribute in <meta ${attribute}="${name}">; found ${contentMatches.length}.`)
  const updated = tag.replace(/(\scontent=")[^"]*(")/i, (_match, before, after) => `${before}${escapeHtml(value)}${after}`)
  return htmlSource.replace(tag, updated)
}

const openingHtmlTags = [...html.matchAll(/<html\b[^>]*>/gi)]
if (openingHtmlTags.length !== 1) throw new Error(`Expected one <html> element; found ${openingHtmlTags.length}.`)
let openingHtml = openingHtmlTags[0][0]
openingHtml = replaceAttribute(openingHtml, 'lang', 'en', 'ar', '<html> language')
openingHtml = replaceAttribute(openingHtml, 'dir', 'ltr', 'rtl', '<html> direction')
html = html.replace(openingHtmlTags[0][0], openingHtml)

const titles = [...html.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>/gi)]
if (titles.length !== 1) throw new Error(`Expected one <title> element; found ${titles.length}.`)
html = html.replace(titles[0][0], `<title>${escapeHtml(ar.meta_title)}</title>`)

for (const [attribute, name, value] of [
  ['name', 'description', ar.meta_description],
  ['property', 'og:title', ar.meta_title],
  ['property', 'og:description', ar.meta_description],
  ['property', 'og:locale', 'ar_EG'],
  ['property', 'og:image:alt', ar.og_image_alt],
  ['name', 'twitter:title', ar.meta_title],
  ['name', 'twitter:description', ar.meta_description],
  ['name', 'twitter:image:alt', ar.og_image_alt]
]) {
  html = setMetaContent(html, attribute, name, value)
}

html = replaceTag(
  html,
  tag => /\srel="canonical"/i.test(tag),
  'link',
  { name: 'href', value: `${origin}/` },
  `${origin}/ar/`,
  'English canonical link'
)
html = setMetaContent(html, 'property', 'og:url', `${origin}/ar/`)

const schemaPattern = /(<script id="portfolio-schema" type="application\/ld\+json">)([\s\S]*?)(<\/script>)/
const schemaMatch = html.match(schemaPattern)
if (!schemaMatch) throw new Error('Missing #portfolio-schema JSON-LD script.')
const schema = JSON.parse(schemaMatch[2])
const graph = schema['@graph']
if (!Array.isArray(graph)) throw new Error('The portfolio JSON-LD graph is missing or invalid.')
function requireOneEntity(type) {
  const entries = graph.filter(entry => entry['@type'] === type)
  if (entries.length !== 1) throw new Error(`Expected one ${type} entity in JSON-LD; found ${entries.length}.`)
  return entries[0]
}
const person = requireOneEntity('Person')
const website = requireOneEntity('WebSite')
const page = requireOneEntity('WebPage')
person.description = ar.meta_description
website.inLanguage = ['en', 'ar']
page['@id'] = `${origin}/ar/#webpage`
page.url = `${origin}/ar/`
page.name = ar.meta_title
page.description = ar.meta_description
page.inLanguage = 'ar'
html = html.replace(schemaPattern, (_match, open, _json, close) => `${open}\n${JSON.stringify(schema, null, 2)}\n  ${close}`)

const requiredTranslationAttributes = ['data-i18n', 'data-i18n-placeholder', 'data-i18n-aria-label']
for (const attribute of requiredTranslationAttributes) {
  const pattern = new RegExp(`\\b${attribute}="([^"]+)"`, 'g')
  for (const [, key] of html.matchAll(pattern)) {
    if (typeof ar[key] !== 'string' || !ar[key].trim()) {
      throw new Error(`Missing required Arabic translation for key "${key}" (${attribute}).`)
    }
    if (typeof en[key] !== 'string' || !en[key].trim()) {
      throw new Error(`Translation key "${key}" (${attribute}) is absent from the English locale.`)
    }
  }
}

for (const key of ['meta_title', 'meta_description', 'og_image_alt']) {
  if (typeof ar[key] !== 'string' || !ar[key].trim()) {
    throw new Error(`Missing required Arabic translation for metadata key "${key}".`)
  }
}

html = html.replace(/<([a-z][\w:-]*)\b([^>]*\bdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi,
  (match, tag, attributes, key, content) => {
    if (/<[a-z][\w:-]*\b/i.test(content)) {
      throw new Error(`Cannot safely localize nested markup for key "${key}" on <${tag}>.`)
    }
    return `<${tag}${attributes}>${escapeHtml(ar[key])}</${tag}>`
  })

function replaceTranslatedAttribute(attributeName, keyAttribute) {
  const pattern = new RegExp(`<([a-z][\\w:-]*)\\b([^>]*\\b${keyAttribute}="([^"]+)"[^>]*)>`, 'gi')
  html = html.replace(pattern, (_match, tag, attributes, key) => {
    const attributePattern = new RegExp(`\\s${attributeName}="[^"]*"`, 'i')
    const translated = ` ${attributeName}="${escapeHtml(ar[key])}"`
    const updated = attributePattern.test(attributes)
      ? attributes.replace(attributePattern, translated)
      : `${attributes}${translated}`
    return `<${tag}${updated}>`
  })
}
replaceTranslatedAttribute('placeholder', 'data-i18n-placeholder')
replaceTranslatedAttribute('aria-label', 'data-i18n-aria-label')

if (/<html\b[^>]*\blang="en"|<html\b[^>]*\bdir="ltr"/i.test(html)) {
  throw new Error('The generated Arabic document still has English language or LTR direction attributes.')
}
const generatedCanonical = [...html.matchAll(/<link\b[^>]*>/gi)].filter(([tag]) => /\srel="canonical"/i.test(tag))
const generatedCanonicalHref = generatedCanonical[0]?.[0].match(/\shref="([^"]+)"/i)?.[1]
if (generatedCanonical.length !== 1 || generatedCanonicalHref !== `${origin}/ar/`) {
  throw new Error(`Expected one Arabic self-canonical link to ${origin}/ar/.`)
}
const generatedOgUrl = [...html.matchAll(/<meta\b[^>]*>/gi)].filter(([tag]) => /\sproperty="og:url"/i.test(tag))
if (generatedOgUrl.length !== 1 || generatedOgUrl[0][0].match(/\scontent="([^"]+)"/i)?.[1] !== `${origin}/ar/`) {
  throw new Error(`Expected one Arabic Open Graph URL to ${origin}/ar/.`)
}
for (const [language, href] of [['en', `${origin}/`], ['ar', `${origin}/ar/`], ['x-default', `${origin}/`]]) {
  const alternates = [...html.matchAll(/<link\b[^>]*>/gi)].filter(([tag]) => new RegExp(`\\shreflang="${language}"`, 'i').test(tag))
  if (alternates.length !== 1 || alternates[0][0].match(/\shref="([^"]+)"/i)?.[1] !== href) {
    throw new Error(`Expected one hreflang="${language}" link to ${href}.`)
  }
}

if (html.includes('src="./assets/') || html.includes('href="./assets/')) {
  throw new Error('Build output has relative asset paths that are unsafe from /ar/.')
}
await mkdir(resolve(dist, 'ar'), { recursive: true })
await writeFile(resolve(dist, 'ar/index.html'), html, 'utf8')
console.log(`Generated Arabic static page at ${resolve(dist, 'ar/index.html')}; English remains at /.`)

