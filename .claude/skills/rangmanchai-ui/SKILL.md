---
name: rangmanchai-ui
description: Brand design system and UI/UX standards for RangManchAI SaaS platform. Use when building any frontend component, page, or user-facing feature. Triggers on: component, page, UI, dashboard, checkpoint, card, modal, form, design, layout, animation, styling, frontend, screen, storyboard UI, scene card, voice selector, credit display, progress, stepper.
---

## Design Philosophy
RangManchAI is a premium Indian AI SaaS. UI is light, modern, glassmorphic — combining elegance with functionality. Every interaction feels smooth and intentional. Built on CSS variables for perfect theming.

## Colour Tokens (from theme.css)
All colors use CSS variables and support light/dark modes automatically.

### Primary Colors
- **Accent**: hsl(334 82% 63%) — Magenta/Pink (primary brand color)
- **Accent Contrast**: hsl(0 0% 100%) light theme, hsl(0 0% 8%) dark theme
- **Success**: hsl(145 63% 35%) light, hsl(145 43% 62%) dark
- **Danger**: hsl(355 72% 52%) light, hsl(355 68% 66%) dark

### Background & Surfaces
```
Light Theme:
  --color-bg: 220 20% 98%           (Off-white)
  --color-bg-soft: 220 18% 96%      (Lighter)
  --color-surface: 0 0% 100%        (Pure white)
  --color-elevated: 220 16% 99%     (Subtle elevation)
  
Dark Theme:
  --color-bg: 0 0% 4%               (Almost black)
  --color-surface: 0 0% 9%          (Dark gray)
  --color-elevated: 0 0% 12%        (Slightly lighter)
```

### Text & Borders
- **Text Primary**: hsl(222 24% 14%) light, hsl(0 0% 95%) dark
- **Text Muted**: hsl(220 10% 42%) light, hsl(0 0% 66%) dark
- **Border**: hsl(220 16% 84%) light, hsl(0 0% 18%) dark
- **Border Soft**: hsl(220 18% 90%) light, hsl(0 0% 13%) dark

## Typography
- **Headings**: Sora (Google Font) — wght 600, 700, 800
- **Body**: Manrope (Google Font) — wght 400, 500, 600, 700, 800
- **Monospace (code)**: JetBrains Mono
- **Scale**: 12 / 14 / 16 / 18 / 20 / 24 / 32 / 40 / 48px

## Component Standards

### Glass Cards (MOST USED)
Use these pre-defined classes from globals.css:
```
.glass-card — Standard glassmorphic card
  background: hsl(var(--color-surface-glass) / 0.56)
  backdrop-filter: blur(16px)
  border: 1px solid hsl(var(--color-border) / 0.72)
  box-shadow: var(--shadow-float), inset 0 1px 0 hsl(var(--color-surface) / 0.22)

.rangmanch-glass — Strong glass effect
  background: hsl(var(--color-surface-glass) / 0.58)
  backdrop-filter: blur(16px)
  border: 1px solid hsl(var(--color-border) / 0.7)
  box-shadow: var(--shadow-float)

.rangmanch-glass-strong — Cinematic glass
  background: hsl(var(--color-surface-glass-strong) / 0.78)
  backdrop-filter: blur(20px)
  border: 1px solid hsl(var(--color-border) / 0.82)
  box-shadow: var(--shadow-cinematic)

.rangmanch-matte-surface — Solid surface (not glass)
  background: linear-gradient(180deg, hsl(var(--color-surface) / 0.94), hsl(var(--color-elevated) / 0.86))
  border: 1px solid hsl(var(--color-border) / 0.7)
  box-shadow: var(--shadow-soft)

.rangmanch-floating-hero — Premium floating surface
  background: radial gradients + glass
  border: 1px solid hsl(var(--color-border) / 0.64)
  box-shadow: var(--shadow-cinematic)
  backdrop-filter: blur(18px)
```

### Buttons
```
Primary (Accent):
  bg-accent hover:brightness-102 text-accent-contrast
  rounded-lg px-6 py-3 font-medium
  200ms ease-out transition
  min-height 44px

Secondary (Glass):
  bg-surface/5 hover:bg-surface/10 border border-border
  rounded-lg px-6 py-3
  
Danger:
  bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20
  
All buttons:
  active:scale-97 (pressed state)
```

### Modals & Dialogs
```
Backdrop: backdrop-blur-xl bg-black/60
Body: .rangmanch-glass-strong
Border radius: 0.875rem (--radius-lg)
Entry: scale 0.95→1 + fade in, 200ms ease-out
```

### Shadows (Use These)
```
--shadow-soft: 0 8px 32px hsl(var(--color-text) / 0.06)      [Subtle]
--shadow-hard: 0 16px 40px hsl(var(--color-text) / 0.14)     [Medium]
--shadow-float: 0 20px 60px hsl(var(--color-text) / 0.08)    [Cards]
--shadow-cinematic: 0 28px 80px hsl(220 35% 12% / 0.16)      [Premium]
```

### Border Radii
```
--radius-sm: 0.375rem
--radius-md: 0.625rem
--radius-lg: 0.875rem
--radius-xl: clamp(1.5rem, 2.2vw, 1.75rem)
```

## Storyboard Pipeline UI Patterns

### Scene Cards
```
Structure:
  - Wrapper: .glass-card
  - Image: aspect-ratio 9:16, rounded-lg
  - Metadata: scene number badge, type tag, line text
  - Actions: approve (success color) + reject (danger color)
  - Feedback: textarea on reject, hidden by default
  
States:
  - Default: neutral border
  - Approved: success border glow
  - Rejected: danger border, feedback visible
```

### Checkpoint Stepper
```
Container: .rangmanch-matte-surface
Steps: Vertical layout
  - Done: green filled circle + ✓ checkmark
  - Active: accent color circle + pulsing animation
  - Pending: muted color empty circle
Each step: title + subtitle + status indicator
```

### Credit Bar
```
Container: fixed bottom, .rangmanch-glass-strong
Layout: flex row with spacing
  - Left: Cost info text
  - Right: Confirm button (accent color)
Show: "Next costs X credits | Balance: Y | After: Z"
Button: Primary button style, required to proceed
```

### Category Selector
```
Grid: responsive (1 col mobile, full desktop)
Card: .glass-card with hover effects
  - Title + description (1 line)
  - Optional: sample video (autoplay muted)
Selected: accent border + checkmark + scale(1.02)
```

## Animations
Use keyframes from theme.css (rangmanch-* prefix):
- rangmanch-loader-ring — Loading spinner
- rangmanch-loader-glow — Pulsing glow
- rangmanch-spotlight — Spotlight effect
- rangmanch-curtain-left/right — Curtain animation
- rangmanch-tabla-pulse — Pulsing element

## Tailwind Color Mapping
Colors automatically use CSS variables via tailwind config:
```
bg-bg, bg-surface, bg-elevated, bg-text
border-border, border-muted
text-text, text-muted
bg-accent, text-accent-contrast
bg-success, bg-danger
```

## UX Rules
- Show credit cost BEFORE every action (not auto-deduct)
- Glassmorphic surfaces for overlays and elevated content
- Matte surfaces for primary content areas
- Use .glass-card for all card components
- Accent color (#334 82% 63%) for CTAs and primary actions
- Min touch target: 44x44px
- All transitions: 200ms ease-out
- Dark mode: automatically handled via .dark class

## DO's and DON'Ts
✅ DO use .glass-card, .rangmanch-glass, .rangmanch-matte-surface
✅ DO use hsl(var(--color-*)) for colors
✅ DO use Sora/Manrope fonts
✅ DO use shadows from theme.css
❌ DON'T use hardcoded hex colors
❌ DON'T use random UI libraries (use free Aceternity/Magic UI only)
❌ DON'T override theme colors
❌ DON'T create custom glass effects (use provided classes)
