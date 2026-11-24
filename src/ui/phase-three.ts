import './phase-three.css'
import { profile } from '../data/profile.js'
import { ACHIEVEMENTS, achievements } from '../world/achievements.js'
import { getLocale, t } from '../i18n/index.js'

type SectionName = 'about' | 'projects' | 'skills' | 'experience' | 'education' | 'achievements' | 'contact'
interface PhaseThreeOptions {
  navigate: (section: SectionName, projectIndex?: number) => void
  openProject?: (projectIndex: number) => void
}
interface Answer { text: string; section?: SectionName; projectIndexes?: number[] }

const tr = (key: string, values: Record<string, string> = {}): string =>
  Object.entries(values).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement), t(key as any))

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function projectTitle(index: number): string { return t(`project_title_${index}` as any) }
function projectDescription(index: number): string { return t(`project_long_description_${index}` as any) }
function projectCategory(category: string): string { return t(`project_category_${category}` as any) }
function softSkillItems(): string[] { return profile.skills.softSkills.map((_, index) => t(`skills_soft_item_${index}` as any)) }
function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null } catch { return null }
}
function normalize(value: string): string { return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function includesAny(value: string, terms: string[]): boolean { return terms.some(term => value.includes(normalize(term))) }

export function mountPhaseThree(options: PhaseThreeOptions): void {
  const toolsMenu = document.getElementById('experience-tools-menu')
  const toolTriggers = [document.getElementById('experience-menu-trigger'), document.getElementById('experience-menu-trigger-classic')].filter((node): node is HTMLButtonElement => node instanceof HTMLButtonElement)
  const panels = ['assistant-panel', 'terminal-panel', 'recruiter-panel'].map(id => document.getElementById(id)).filter((node): node is HTMLElement => node instanceof HTMLElement)
  const assistantLog = document.getElementById('assistant-messages')
  const assistantInput = document.getElementById('assistant-input') as HTMLInputElement | null
  const assistantForm = document.getElementById('assistant-form') as HTMLFormElement | null
  const terminalOutput = document.getElementById('terminal-output')
  const terminalInput = document.getElementById('terminal-input') as HTMLInputElement | null
  const terminalForm = document.getElementById('terminal-form') as HTMLFormElement | null
  const recruiterPanel = document.getElementById('recruiter-panel')
  const recruiterContent = document.getElementById('recruiter-content')
  let previousFocus: HTMLElement | null = null
  let commandHistory: string[] = []
  let commandIndex = 0
  let answerSequence = 0
  let activeTyping: HTMLElement | null = null

  if (!toolsMenu || !assistantLog || !assistantInput || !assistantForm || !terminalOutput || !terminalInput || !terminalForm || !recruiterPanel || !recruiterContent) return

  const closeMenu = (restoreFocus = false) => {
    const focusWasInMenu = toolsMenu.contains(document.activeElement)
    toolsMenu.hidden = true
    toolTriggers.forEach(button => button.setAttribute('aria-expanded', 'false'))
    if (restoreFocus && focusWasInMenu) {
      const trigger = toolTriggers.find(button => button.offsetParent !== null)
      trigger?.focus()
    }
  }

  toolTriggers.forEach(button => button.addEventListener('click', () => {
    toolsMenu.hidden = !toolsMenu.hidden
    toolTriggers.forEach(trigger => trigger.setAttribute('aria-expanded', String(!toolsMenu.hidden)))
  }))

  const closePanel = (panel: HTMLElement, returnFocus = true) => {
    panel.hidden = true
    if (returnFocus) previousFocus?.focus()
  }

  const openPanel = (panel: HTMLElement, focusTarget: HTMLElement | null) => {
    closeMenu()
    panels.forEach(other => { if (other !== panel) other.hidden = true })
    previousFocus = toolTriggers.find(button => button.offsetParent !== null) ?? toolTriggers[0] ?? null
    panel.hidden = false
    document.dispatchEvent(new CustomEvent('phase3:modal-open'))
    requestAnimationFrame(() => focusTarget?.focus())
  }

  document.getElementById('assistant-open')?.addEventListener('click', () => openPanel(document.getElementById('assistant-panel')!, assistantInput))
  document.getElementById('terminal-open')?.addEventListener('click', () => openPanel(document.getElementById('terminal-panel')!, terminalInput))
  document.getElementById('recruiter-open')?.addEventListener('click', () => {
    renderRecruiter()
    openPanel(recruiterPanel, document.getElementById('recruiter-close'))
  })
  document.getElementById('recruiter-close')?.addEventListener('click', () => closePanel(recruiterPanel))
  document.querySelectorAll<HTMLButtonElement>('[data-close-phase3]').forEach(button => button.addEventListener('click', () => {
    const panel = document.getElementById(button.dataset.closePhase3 ?? '')
    if (panel) closePanel(panel)
  }))

  document.addEventListener('click', event => {
    if (toolsMenu.hidden) return
    const target = event.target
    if (target instanceof Node && !toolsMenu.contains(target) && !toolTriggers.some(button => button.contains(target))) closeMenu()
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMenu(true)
      const panel = panels.find(candidate => !candidate.hidden)
      if (panel) closePanel(panel)
      return
    }
    const activePanel = panels.find(candidate => !candidate.hidden)
    if (!activePanel || event.key !== 'Tab') return
    const focusable = [...activePanel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
      .filter(node => node.offsetParent !== null)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  })

  const assistantMessage = (role: 'assistant' | 'user', text: string, answer?: Answer) => {
    const bubble = element('article', `assistant-message ${role}`, text)
    if (answer?.section) {
      const actions = element('div', 'assistant-actions')
      const action = element('button', '', tr(`assistant_action_${answer.section}`))
      action.type = 'button'
      action.addEventListener('click', () => { closePanel(document.getElementById('assistant-panel')!, false); options.navigate(answer.section!, answer.projectIndexes?.length === 1 ? answer.projectIndexes[0] : undefined) })
      actions.append(action)
      bubble.append(actions)
    }
    if (answer?.projectIndexes?.length) {
      const actions = element('div', 'assistant-actions')
      answer.projectIndexes.forEach(index => {
        const project = profile.projects[index]
        if (options.openProject) {
          const details = element('button', '', `${tr('project_details')}: ${projectTitle(index)}`)
          details.type = 'button'
          details.addEventListener('click', () => { closePanel(document.getElementById('assistant-panel')!); options.openProject!(index) })
          actions.append(details)
        }
        const githubUrl = safeExternalUrl(project.githubUrl)
        if (githubUrl) {
          const link = element('a', '', `${projectTitle(index)} · GitHub`)
          link.href = githubUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          actions.append(link)
        }
      })
      bubble.append(actions)
    }
    assistantLog!.append(bubble)
    assistantLog!.scrollTop = assistantLog!.scrollHeight
  }

  const answerQuestion = (question: string): Answer => {
    const query = normalize(question)
    const indexes = profile.projects.map((_, index) => index)
    if (includesAny(query, ['contact', 'email', 'hire', 'تواصل', 'بريد', 'اتصل'])) {
      return { text: tr('assistant_contact'), section: 'contact' }
    }
    if (/\b(ai|ml|artificial intelligence|machine learning)\b/.test(query) || includesAny(query, ['ذكاء اصطناعي', 'تعلم آلي', 'تعلم الآلة'])) {
      return { text: tr('assistant_ai_answer'), section: 'projects', projectIndexes: [1] }
    }
    if (includesAny(query, ['strongest', 'best project', 'featured', 'أفضل', 'الأقوى', 'المميزة'])) {
      const featured = indexes.filter(index => profile.projects[index].featured)
      return { text: tr('assistant_featured'), section: 'projects', projectIndexes: featured }
    }
    if (includesAny(query, ['project', 'github projects', 'مشروع', 'مشاريع', 'اعمال'])) {
      return { text: tr('assistant_projects'), section: 'projects', projectIndexes: indexes }
    }
    if (includesAny(query, ['skill', 'technolog', 'technology', 'tech stack', 'مهارة', 'تقنية', 'تكنولوجيا', 'تقنيات'])) {
      const skills = [...profile.skills.languages, ...profile.skills.frameworks, ...profile.skills.tools, ...softSkillItems()].join(' · ')
      return { text: tr('assistant_skills', { skills }), section: 'skills' }
    }
    if (includesAny(query, ['experience', 'work history', 'خبرة', 'الخبرة', 'عمل'])) {
      const item = profile.experience[0]
      return { text: tr('assistant_experience', { role: t('experience_role'), organization: t('experience_org'), period: item?.period ?? '', description: t('experience_desc') }), section: 'experience' }
    }
    if (includesAny(query, ['education', 'study', 'school', 'تعليم', 'دراسة', 'مدرسة'])) {
      return { text: tr('assistant_education', { degree: t('education_degree'), institution: t('education_institution'), period: t('education_period'), description: t('education_desc') }), section: 'education' }
    }
    if (includesAny(query, ['who', 'about', 'mahamed', 'identity', 'من هو', 'محمد', 'عرفني', 'نبذة'])) {
      return { text: tr('assistant_about', { name: profile.name, title: t('profile_title'), bio: t('profile_bio') }), section: 'about' }
    }
    return { text: tr('assistant_unknown') }
  }

  const suggestions = document.getElementById('assistant-suggestions')
  const renderSuggestions = () => {
    if (!suggestions) return
    suggestions.replaceChildren()
    ;['assistant_q_who', 'assistant_q_projects', 'assistant_q_skills', 'assistant_q_contact'].forEach(key => {
      const button = element('button', '', t(key as any))
      button.type = 'button'
      button.addEventListener('click', () => ask(button.textContent ?? ''))
      suggestions.append(button)
    })
  }

  function ask(question: string) {
    const value = question.trim().slice(0, 400)
    if (!value) return
    assistantMessage('user', value)
    assistantInput!.value = ''
    const sequence = ++answerSequence
    activeTyping?.remove()
    const typing = element('div', 'assistant-typing', t('assistant_typing'))
    activeTyping = typing
    typing.setAttribute('role', 'status')
    assistantLog!.append(typing)
    assistantLog!.scrollTop = assistantLog!.scrollHeight
    window.setTimeout(() => {
      if (sequence !== answerSequence) return
      typing.remove()
      activeTyping = null
      try { const answer = answerQuestion(value); assistantMessage('assistant', answer.text, answer) }
      catch (error) { console.error('Portfolio assistant response failed.', error); assistantMessage('assistant', tr('assistant_error')) }
    }, 320)
  }

  assistantForm.addEventListener('submit', event => { event.preventDefault(); ask(assistantInput.value) })
  assistantMessage('assistant', tr('assistant_greeting'))
  renderSuggestions()

  const terminalLine = (text: string, kind = '') => {
    const line = element('p', `terminal-line ${kind}`, text)
    terminalOutput!.append(line)
    terminalOutput!.scrollTop = terminalOutput!.scrollHeight
    return line
  }
  const terminalSectionAction = (line: HTMLElement, section: SectionName, projectIndex?: number, projectDetails = false) => {
    const button = element('button', '', projectDetails ? tr('project_details') : tr('terminal_open_section'))
    button.type = 'button'
    button.addEventListener('click', () => {
      closePanel(document.getElementById('terminal-panel')!, projectDetails)
      if (projectDetails && projectIndex !== undefined && options.openProject) options.openProject(projectIndex)
      else options.navigate(section, projectIndex)
    })
    line.append(' · ', button)
  }
  const terminalCommands = ['help', 'about', 'projects', 'skills', 'experience', 'education', 'contact', 'github', 'clear']
  const runCommand = (raw: string) => {
    const command = normalize(raw).split(/\s+/)[0] ?? ''
    if (!command) return
    commandHistory.push(raw.trim())
    commandIndex = commandHistory.length
    terminalLine(`> ${raw.trim()}`, 'command')
    if (command === 'clear') { terminalOutput!.replaceChildren(); return }
    if (command === 'help') { terminalLine(tr('terminal_help')); return }
    if (command === 'about') {
      const line = terminalLine(tr('terminal_about', { name: profile.name, title: t('profile_title'), bio: t('profile_bio') }))
      terminalSectionAction(line, 'about')
      return
    }
    if (command === 'projects') {
      terminalLine(tr('terminal_projects'))
      profile.projects.forEach((project, index) => {
        const line = element('p', 'terminal-line')
        const githubUrl = safeExternalUrl(project.githubUrl)
        if (githubUrl) {
          const link = element('a', '', projectTitle(index))
          link.href = githubUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          line.append(link, ' · ')
        } else line.append(projectTitle(index), ' · ')
        terminalOutput!.append(line)
        terminalSectionAction(line, 'projects', index)
        terminalSectionAction(line, 'projects', index, true)
      })
      return
    }
    if (command === 'skills') {
      const line = terminalLine(tr('terminal_skills', { skills: [...profile.skills.languages, ...profile.skills.frameworks, ...profile.skills.tools, ...softSkillItems()].join(' · ') }))
      terminalSectionAction(line, 'skills')
      return
    }
    if (command === 'experience') {
      const item = profile.experience[0]
      const line = terminalLine(tr('terminal_experience', { role: t('experience_role'), organization: t('experience_org'), period: item?.period ?? '' }))
      terminalSectionAction(line, 'experience')
      return
    }
    if (command === 'education') {
      const line = terminalLine(tr('terminal_education', { degree: t('education_degree'), institution: t('education_institution'), period: t('education_period') }))
      terminalSectionAction(line, 'education')
      return
    }
    if (command === 'contact') {
      const line = terminalLine(tr('terminal_contact'))
      const link = element('a', '', `${t('contact_email' as any)}: ${profile.email}`)
      link.href = `mailto:${encodeURIComponent(profile.email)}`
      const whatsapp = element('a', '', `${t('contact_phone' as any)}: ${profile.whatsappNumber}`)
      whatsapp.href = profile.whatsappUrl
      whatsapp.target = '_blank'
      whatsapp.rel = 'noopener noreferrer'
      const telegram = element('a', '', `${t('contact_telegram' as any)}: ${profile.telegramUsername}`)
      telegram.href = profile.telegramUrl
      telegram.target = '_blank'
      telegram.rel = 'noopener noreferrer'
      line.append(link, ' · ', whatsapp, ' · ', telegram)
      terminalSectionAction(line, 'contact')
      return
    }
    if (command === 'github') {
      const line = terminalLine(tr('terminal_github'))
      const githubUrl = safeExternalUrl(profile.githubUrl)
      if (githubUrl) {
        const link = element('a', '', githubUrl)
        link.href = githubUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        line.append(' ', link)
      }
      return
    }
    terminalLine(tr('terminal_unknown'), 'error')
  }

  terminalForm.addEventListener('submit', event => {
    event.preventDefault()
    runCommand(terminalInput.value)
    terminalInput.value = ''
  })
  terminalInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' && commandHistory.length) {
      event.preventDefault()
      commandIndex = Math.max(0, commandIndex - 1)
      terminalInput.value = commandHistory[commandIndex]
    } else if (event.key === 'ArrowDown' && commandHistory.length) {
      event.preventDefault()
      commandIndex = Math.min(commandHistory.length, commandIndex + 1)
      terminalInput.value = commandHistory[commandIndex] ?? ''
    } else if (event.key === 'Tab') {
      const match = terminalCommands.find(command => command.startsWith(terminalInput.value.toLowerCase()))
      if (match) { event.preventDefault(); terminalInput.value = match }
    }
  })
  const shortcuts = document.getElementById('terminal-shortcuts')
  const renderShortcuts = () => {
    if (!shortcuts) return
    shortcuts.replaceChildren()
    terminalCommands.filter(command => command !== 'clear').forEach(command => {
      const button = element('button', '', command)
      button.type = 'button'
      button.addEventListener('click', () => { if (command === 'help') { runCommand(command); terminalInput!.focus() } else { terminalInput!.value = command; terminalInput!.focus() } })
      shortcuts.append(button)
    })
  }
  renderShortcuts()
  terminalLine(tr('terminal_welcome'))

  const addRecruiterSection = (title: string, id: string): HTMLElement => {
    const section = element('section', 'recruiter-section')
    section.id = `recruiter-${id}`
    section.append(element('h2', '', title))
    recruiterContent!.append(section)
    return section
  }

  const navigationAction = (parent: HTMLElement, label: string, section: SectionName, projectIndex?: number) => {
    const button = element('button', 'recruiter-exit', label)
    button.type = 'button'
    button.addEventListener('click', () => { closePanel(recruiterPanel, false); options.navigate(section, projectIndex) })
    parent.append(button)
  }

  function renderRecruiter() {
    recruiterContent!.replaceChildren()
    recruiterContent!.append(element('p', 'recruiter-intro', tr('recruiter_intro')))

    const projectsSection = addRecruiterSection(tr('recruiter_projects'), 'projects')
    const grid = element('div', 'recruiter-projects')
    profile.projects.forEach((project, index) => {
      if (!project.featured) return
      const card = element('article', 'recruiter-project')
      card.append(element('h3', '', projectTitle(index)))
      card.append(element('p', '', projectDescription(index)))
      const category = element('p', '', projectCategory(project.category))
      card.append(category)
      const tags = element('div', 'tech-stack')
      project.techStack.forEach(tech => tags.append(element('span', 'tag', tech)))
      card.append(tags)
      const links = element('div', 'recruiter-links')
      const githubUrl = safeExternalUrl(project.githubUrl)
      if (githubUrl) {
        const github = element('a', '', 'GitHub')
        github.href = githubUrl
        github.target = '_blank'
        github.rel = 'noopener noreferrer'
        links.append(github)
      }
      if (project.liveUrl) {
        const liveUrl = safeExternalUrl(project.liveUrl)
        if (liveUrl) {
          const demo = element('a', '', t('view_live_demo' as any))
          demo.href = liveUrl
          demo.target = '_blank'
          demo.rel = 'noopener noreferrer'
          links.append(demo)
        }
      }
      card.append(links)
      if (options.openProject) {
        const details = element('button', 'recruiter-exit', tr('project_details'))
        details.type = 'button'
        details.addEventListener('click', () => { closePanel(recruiterPanel!); options.openProject!(index) })
        card.append(details)
      } else navigationAction(card, tr('assistant_action_project'), 'projects', index)
      grid.append(card)
    })
    projectsSection.append(grid)

    const skillsSection = addRecruiterSection(tr('recruiter_skills'), 'skills')
    const skillsGrid = element('div', 'recruiter-skills')
    const skillGroups = [
      [t('skills_languages' as any), profile.skills.languages],
      [t('skills_frameworks' as any), profile.skills.frameworks],
      [t('skills_tools' as any), profile.skills.tools],
      [t('skills_soft' as any), softSkillItems()]
    ] as const
    skillGroups.forEach(([title, items]) => {
      const group = element('div')
      group.append(element('h3', '', title))
      const chips = element('div', 'skill-tags')
      items.forEach(item => chips.append(element('span', 'tag', item)))
      group.append(chips)
      skillsGrid.append(group)
    })
    skillsSection.append(skillsGrid)
    navigationAction(skillsSection, tr('assistant_action_skills'), 'skills')

    const experienceSection = addRecruiterSection(tr('recruiter_experience'), 'experience')
    const experienceTimeline = element('div', 'recruiter-timeline')
    profile.experience.forEach(item => {
      const entry = element('article', 'recruiter-entry')
      entry.append(element('h3', '', t('experience_role' as any)))
      entry.append(element('p', '', `${t('experience_org' as any)} · ${item.period}`))
      entry.append(element('p', '', t('experience_desc' as any)))
      experienceTimeline.append(entry)
    })
    experienceSection.append(experienceTimeline)
    navigationAction(experienceSection, tr('assistant_action_experience'), 'experience')

    const educationSection = addRecruiterSection(tr('recruiter_education'), 'education')
    profile.education.forEach(item => {
      const entry = element('article', 'recruiter-entry')
      entry.append(element('h3', '', t('education_degree' as any)))
      entry.append(element('p', '', `${t('education_institution' as any)} · ${t('education_period' as any)}`))
      entry.append(element('p', '', t('education_desc' as any)))
      educationSection.append(entry)
    })
    navigationAction(educationSection, tr('assistant_action_education'), 'education')

    const achievementSection = addRecruiterSection(tr('recruiter_achievements'), 'achievements')
    const unlocked = ACHIEVEMENTS.filter(item => achievements.getState().unlocked.has(item.id))
    if (!unlocked.length) achievementSection.append(element('p', '', tr('recruiter_empty_achievements')))
    unlocked.forEach(item => {
      const totals = achievements.getTotals()
      const count = item.id === 'explorer' ? totals.zones : item.id === 'ring_master' ? Math.ceil(totals.rings * 0.75) : totals.rings
      const description = tr(`achievement_desc_${item.id}`, { count: String(count) })
      achievementSection.append(element('p', '', `${item.icon} ${t(`achievement_name_${item.id}` as any)} — ${description}`))
    })
    navigationAction(achievementSection, tr('recruiter_achievements'), 'achievements')

    const contactSection = addRecruiterSection(tr('recruiter_contact'), 'contact')
    const contactCards = element('div', 'contact-methods recruiter-contact')
    const contactCard = (platform: 'email' | 'whatsapp' | 'telegram', label: string, detail: string, href: string) => {
      const card = element('a', `contact-method contact-${platform}`, '')
      card.href = href
      if (platform !== 'email') { card.target = '_blank'; card.rel = 'noopener noreferrer' }
      const icon = element('span', 'contact-method-icon', platform === 'email' ? '✉' : platform === 'whatsapp' ? '◉' : '➤')
      icon.setAttribute('aria-hidden', 'true')
      const copy = element('span', '', label)
      const value = element('small', '', detail)
      value.dir = 'ltr'
      copy.append(value)
      card.append(icon, copy)
      return card
    }
    contactCards.append(
      contactCard('whatsapp', t('contact_whatsapp' as any), profile.whatsappNumber, profile.whatsappUrl),
      contactCard('telegram', t('contact_telegram' as any), profile.telegramUsername, profile.telegramUrl),
      contactCard('email', t('contact_email' as any), profile.email, `mailto:${encodeURIComponent(profile.email)}`)
    )
    const github = element('a', '', tr('recruiter_github'))
    const githubUrl = safeExternalUrl(profile.githubUrl)
    contactSection.append(contactCards)
    if (githubUrl) { github.href = githubUrl; github.target = '_blank'; github.rel = 'noopener noreferrer'; contactSection.append(github) }
  }

  document.addEventListener('localechange', () => {
    renderSuggestions()
    renderShortcuts()
    answerSequence++
    activeTyping?.remove()
    activeTyping = null
    assistantLog!.replaceChildren()
    assistantMessage('assistant', tr('assistant_greeting'))
    terminalOutput!.replaceChildren()
    terminalLine(tr('terminal_welcome'))
    commandHistory = []
    commandIndex = 0
    if (!recruiterPanel.hidden) renderRecruiter()
  })
  achievements.onChange(() => { if (!recruiterPanel.hidden) renderRecruiter() })
}

export type { SectionName }

