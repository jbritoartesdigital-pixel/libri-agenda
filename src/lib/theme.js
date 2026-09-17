export function applyProfessionalTheme(theme) {
  const root = document.documentElement
  root.style.setProperty('--brand-primary', theme.primary)
  root.style.setProperty('--brand-secondary', theme.secondary)
  root.style.setProperty('--brand-accent', theme.accent)
  root.style.setProperty('--brand-surface', theme.surface)
}
