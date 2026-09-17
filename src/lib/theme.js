export function applyProfessionalTheme(professional) {
  const root = document.documentElement
  const primary = professional?.primary_color || '#6f8278'
  const secondary = professional?.secondary_color || '#d8e0dc'
  const accent = professional?.accent_color || '#b88968'

  root.style.setProperty('--brand-primary', primary)
  root.style.setProperty('--brand-secondary', secondary)
  root.style.setProperty('--brand-accent', accent)
}
