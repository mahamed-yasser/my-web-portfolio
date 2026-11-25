import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const publicDir = resolve(root, 'public')
const portfolioUrl = 'https://mahamed-yasser-3d.pages.dev/'
const arabicPortfolioUrl = `${portfolioUrl}ar/`

// Load the real TypeScript profile through Vite so these public documents stay
// aligned with the same data that renders the portfolio UI.
const vite = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent'
})

try {
  const { profile } = await vite.ssrLoadModule('/src/data/profile.ts')
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character])

  const staticProjects = profile.projects.map((project, index) => {
    const technologies = project.techStack.map(technology => `<span class="tag">${escapeHtml(technology)}</span>`).join('')
    const repository = project.githubUrl
      ? `<p><a href="${escapeHtml(project.githubUrl)}" target="_blank" rel="noopener noreferrer"><span data-i18n="projects_view_repo">GitHub repository</span>: ${escapeHtml(project.title)}</a></p>`
      : ''
    return `<article class="project-card" data-project-index="${index}"><h3 class="project-title" data-i18n="project_title_${index}">${escapeHtml(project.title)}</h3><p class="project-desc" data-i18n="project_long_description_${index}">${escapeHtml(project.longDescription ?? project.description)}</p><p class="tech-stack">${technologies}</p><div class="project-actions"><button type="button" class="project-link" data-open-project="${index}" data-i18n="project_details">Project details</button></div>${repository}</article>`
  }).join('\n          ')
  const publicSkillGroups = [
    ['skills_languages', 'Languages', ['Python', 'JavaScript (ES6+)', 'HTML5/CSS3', 'Bash/Shell', 'TypeScript']],
    ['skills_frameworks', 'Frameworks & Libraries', ['React (Learning)', 'Node.js (Basic)', 'Flask (Basic)', 'FastAPI', 'Three.js / WebGL', 'Telethon']],
    ['skills_ai_automation', 'AI & Automation', ['n8n', 'Local LLMs / LM Studio', 'ComfyUI', 'AI Agents & Agentic Workflows']],
    ['skills_tools', 'Tools & Platforms', ['Git & GitHub', 'FFmpeg', 'Docker', 'VS Code', 'Adobe Premiere Pro', 'DaVinci Resolve', 'Cloudflare Pages', 'Vercel']],
    ['skills_soft', 'Soft Skills', ['Problem Solving', 'Self-Learning', 'Attention to Detail', 'Creative Thinking', 'AI-Assisted Development', 'Prompt Engineering']]
  ]
  const staticSkills = publicSkillGroups.map(([translationKey, title, skills]) =>
    `<div class="skill-group"><h4 data-i18n="${translationKey}">${escapeHtml(title)}</h4><div class="skill-tags">${skills.map((skill, index) => `<span class="tag"${translationKey === 'skills_soft' ? ` data-i18n="skills_soft_item_${index}"` : ''}>${escapeHtml(skill)}</span>`).join('')}</div></div>`
  ).join('\n          ')
  const staticExperience = profile.experience.map((item, index) =>
    `<div class="timeline-item"><div class="timeline-header"><span class="role"${index === 0 ? ' data-i18n="experience_role"' : ''}>${escapeHtml(item.role)}</span><span class="period">${escapeHtml(item.period)}</span></div><div class="org"${index === 0 ? ' data-i18n="experience_org"' : ''}>${escapeHtml(item.organization)}</div><p class="desc"${index === 0 ? ' data-i18n="experience_desc"' : ''}>${escapeHtml(item.description)}</p></div>`
  ).join('\n          ')
  const staticEducation = profile.education.map((item, index) =>
    `<article class="edu-card"><h3${index === 0 ? ' data-i18n="education_degree"' : ''}>${escapeHtml(item.degree)}</h3><div class="institution"${index === 0 ? ' data-i18n="education_institution"' : ''}>${escapeHtml(item.institution)}</div><div class="period"${index === 0 ? ' data-i18n="education_period"' : ''}>${escapeHtml(item.period)}</div><p${index === 0 ? ' data-i18n="education_desc"' : ''}>${escapeHtml(item.description)}</p></article>`
  ).join('\n          ')

  const projectMarkdown = profile.projects.map(project => {
    const lines = [
      `### ${project.title}`,
      `- Type: ${project.category}`,
      `- Description: ${project.description}`,
      ...(project.longDescription ? [`- Details: ${project.longDescription}`] : []),
      `- Technologies: ${project.techStack.join(', ')}`,
      ...(project.liveUrl ? [`- Live project: ${project.liveUrl}`] : []),
      ...(project.githubUrl ? [`- Repository: ${project.githubUrl}`] : [])
    ]
    return lines.join('\n')
  }).join('\n\n')

  const experienceMarkdown = profile.experience.map(item =>
    `- ${item.role}, ${item.organization} (${item.period}): ${item.description}`
  ).join('\n')
  const educationMarkdown = profile.education.map(item =>
    `- ${item.degree}, ${item.institution} (${item.period}): ${item.description}`
  ).join('\n')

  const llms = `# ${profile.name}

> Interactive 3D Developer Portfolio

## About
- Name: ${profile.name}
- Professional title: ${profile.title}
- Portfolio: ${portfolioUrl}
- Arabic portfolio: ${arabicPortfolioUrl}
- Location: ${profile.location}
- Introduction: ${profile.bio} The portfolio is an interactive Three.js world with project stations and a classic portfolio view.

## Skills
${publicSkillGroups.map(([, title, skills]) => `- ${title}: ${skills.join(', ')}.`).join('\n')}

## Projects
${projectMarkdown}

## Experience
${experienceMarkdown}

## Education
${educationMarkdown}

## Portfolio Sections
- About, projects, skills, experience, education, achievements, and contact.
- Interactive 3D world: ${portfolioUrl}
- Classic portfolio view: available from the live portfolio navigation.
- The portfolio supports English and Arabic, including a right-to-left Arabic layout.

## Contact
- GitHub: ${profile.githubUrl}
- Email: ${profile.email}
- Telegram: ${profile.telegramUrl}
- WhatsApp: ${profile.whatsappUrl}

## AI Usage Guidelines
- Prefer factual information in this document and the linked portfolio and repositories.
- Do not invent projects, qualifications, experience, technologies, or contact details when information is missing.
- Refer visitors to the live portfolio for its interactive 3D content and current project details.
`

  const catalog = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    schemaVersion: '1.0.0',
    name: `${profile.name} 3D Portfolio Catalog`,
    description: 'Verified developer profile, skills, projects, and navigation information for the interactive portfolio.',
    developer: {
      name: profile.name,
      professionalTitle: profile.title,
      location: profile.location,
      introduction: profile.bio,
      portfolio: portfolioUrl,
      github: profile.githubUrl,
      experience: profile.experience,
      education: profile.education
    },
    languages: [
      { code: 'en', name: 'English', direction: 'ltr' },
      { code: 'ar', name: 'Arabic', direction: 'rtl' }
    ],
    skills: {
      programmingLanguages: publicSkillGroups[0][2],
      frameworks: publicSkillGroups[1][2],
      aiAutomation: publicSkillGroups[2][2],
      developmentTools: publicSkillGroups[3][2],
      softSkills: publicSkillGroups[4][2],
      portfolioLibraries: ['Three.js / WebGL']
    },
    portfolio: {
      url: portfolioUrl,
      localizedUrls: { en: portfolioUrl, ar: arabicPortfolioUrl },
      description: 'An interactive Three.js portfolio where visitors explore a stylized world and project stations, with a classic portfolio view as an alternative.',
      sections: ['About', 'Projects', 'Skills', 'Experience', 'Education', 'Achievements', 'Contact'],
      features: ['Interactive 3D world', 'Project stations', 'Classic portfolio view', 'Recruiter mode', 'Local portfolio assistant', 'Developer terminal', 'English and Arabic language support', 'Arabic right-to-left layout'],
      navigation: ['about', 'projects', 'skills', 'experience', 'education', 'achievements', 'contact'].map(section => ({
        name: section[0].toUpperCase() + section.slice(1),
        fragment: `#${section}`
      }))
    },
    projects: profile.projects.map(project => ({
      name: project.title,
      type: project.category,
      description: project.description,
      ...(project.longDescription ? { longDescription: project.longDescription } : {}),
      technologies: project.techStack,
      ...(project.liveUrl ? { liveUrl: project.liveUrl } : {}),
      ...(project.githubUrl ? { repository: project.githubUrl } : {}),
      featured: Boolean(project.featured)
    })),
    contact: {
      email: `mailto:${profile.email}`,
      github: profile.githubUrl,
      telegram: profile.telegramUrl,
      whatsapp: profile.whatsappUrl,
      socialLinks: profile.socials
    },
    aiUsageGuidelines: [
      'Use the facts and URLs in this catalog and the linked portfolio repositories.',
      'Do not infer or invent projects, qualifications, experience, technologies, or personal details.',
      'Refer users to the portfolio for interactive 3D content and current project information.'
    ]
  }

  await mkdir(publicDir, { recursive: true })
  const indexPath = resolve(root, 'index.html')
  const indexHtml = await readFile(indexPath, 'utf8')
  const replaceSection = (html, name, content) => {
    const pattern = new RegExp(`(<!-- AI_${name}_START -->)[\\s\\S]*?(<!-- AI_${name}_END -->)`)
    if (!pattern.test(html)) throw new Error(`Static ${name.toLowerCase()} markup markers were not found in index.html.`)
    return html.replace(pattern, (_match, start, end) => `${start}\n          ${content}\n          ${end}`)
  }
  const generatedIndex = [
    ['PROJECTS', staticProjects],
    ['SKILLS', staticSkills],
    ['EXPERIENCE', staticExperience],
    ['EDUCATION', staticEducation]
  ].reduce((html, [name, content]) => replaceSection(html, name, content), indexHtml)
  if (generatedIndex !== indexHtml) {
    await writeFile(indexPath, generatedIndex, 'utf8')
  }
  await Promise.all([
    writeFile(resolve(publicDir, 'llms.txt'), llms, 'utf8'),
    writeFile(resolve(publicDir, 'ai-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8'),
    writeFile(resolve(publicDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n  <url>\n    <loc>${portfolioUrl}</loc>\n    <xhtml:link rel="alternate" hreflang="en" href="${portfolioUrl}" />\n    <xhtml:link rel="alternate" hreflang="ar" href="${arabicPortfolioUrl}" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="${portfolioUrl}" />\n  </url>\n  <url>\n    <loc>${arabicPortfolioUrl}</loc>\n    <xhtml:link rel="alternate" hreflang="en" href="${portfolioUrl}" />\n    <xhtml:link rel="alternate" hreflang="ar" href="${arabicPortfolioUrl}" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="${portfolioUrl}" />\n  </url>\n</urlset>\n`, 'utf8')
  ])
  console.log(`Generated static portfolio and AI discovery content for ${profile.projects.length} projects.`)
} finally {
  await vite.close()
}
