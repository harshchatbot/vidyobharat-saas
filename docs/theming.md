# Theming Strategy

- Single source of truth in `apps/web/src/styles/theme.css` using CSS variables.
- Light mode via `:root`, dark mode via `.dark` class.
- Tailwind maps semantic tokens (`bg`, `surface`, `text`, `accent`, etc.) to CSS variables in `tailwind.config.ts`.
- UI components consume semantic classes only; no hardcoded hex values.

## Token Areas

- Colors: surface/background/text/muted/accent/border/status
- Radius: `--radius-sm|md|lg`
- Shadows: `--shadow-soft|hard`

## Updating Brand Theme

Edit only `apps/web/src/styles/theme.css` and all components/pages inherit changes automatically.
