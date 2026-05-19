---
name: rangmanchai-ui
description: Brand design system and UI/UX standards for RangManchAI SaaS platform. Use this skill when working on RangManchAI frontend UI, components, pages, layouts, checkpoint screens, cards, modals, dashboards, forms, loaders, animations, and responsive UX.
---

## Design Philosophy
RangManchAI is a premium Indian AI SaaS. UI should feel like a cross between Linear and Canva — powerful but approachable. Every screen should feel intentional, modern, and delightful. Never generic. Never boring.

## Colour Tokens
- Background primary: #0A0A0F
- Background elevated: #111118
- Card background: #1A1A2E
- Card border: #ffffff0f
- Accent primary: #7C3AED (electric violet) — primary actions
- Accent secondary: #F59E0B (amber) — CTAs, highlights
- Success: #10B981
- Warning: #F59E0B
- Error: #EF4444
- Text primary: #F8FAFC
- Text secondary: #94A3B8
- Text muted: #475569

## Typography
- Headings: Sora (Google Font)
- UI / Body: Inter (Google Font)
- Monospace (scripts, code): JetBrains Mono
- Scale: 12 / 14 / 16 / 18 / 20 / 24 / 32 / 40 / 48px

## Component Standards

### Cards
- Border radius: 12px
- Border: 1px solid #ffffff0f
- Background: #1A1A2E
- Hover: border-color #7C3AED40 + scale(1.01)
- Shadow: 0 4px 24px rgba(0,0,0,0.4)
- Transition: 200ms ease-out

### Buttons
- Primary: bg-violet-600 hover:bg-violet-500, rounded-lg, px-6 py-3, font-medium
- Secondary: bg-white/5 hover:bg-white/10, border border-white/10
- Danger: bg-red-500/10 hover:bg-red-500/20, text-red-400, border border-red-500/20
- CTA: bg-amber-500 hover:bg-amber-400, text-black font-semibold
- All: 200ms ease-out, min-height 44px, active:scale(0.97)

### Modals
- Border radius: 20px
- Backdrop: backdrop-blur-xl bg-black/60
- Entry animation: scale 0.95→1 + fade in, 200ms ease-out

### Form Inputs
- Background: #ffffff08
- Border: 1px solid #ffffff15
- Focus: border-violet-500, ring-2 ring-violet-500/20
- Label: text-slate-400 text-sm mb-1
- Border radius: 8px

### Glassmorphism overlays
- backdrop-blur-md bg-white/5 border border-white/10

## Storyboard Pipeline UI Patterns

### Scene Cards
- 2-column grid on desktop, 1-column mobile
- Left: generated image (aspect-ratio 9:16, rounded-lg)
- Right: scene number badge, scene type tag, spoken line, visual description, mood chip
- Bottom: thumb-up (green) approve + thumb-down (red) reject + feedback textarea (shown on reject)
- Approved: green border glow, lock icon
- Rejected: red border, feedback input visible

### Checkpoint Stepper
- Vertical stepper left side
- Done: green filled circle with ✓
- Active: violet circle, pulsing dot animation
- Pending: grey empty circle
- Each step: title + subtitle + status

### Credit Estimate Bar
- Sticky bottom bar, always visible during pipeline
- Shows: "Next step costs X credits | Balance: Y | After: Z"
- Amber confirm button — required before deduction
- Never auto-deduct

### Quality Score Ring
- Circular SVG progress ring
- < 5: red (#EF4444)
- 5–7: amber (#F59E0B)
- > 7: green (#10B981)
- Animated stroke-dashoffset on mount
- Score number in centre, label below

### Voice Selector
- Grid of voice cards
- Each: voice name, language badge, gender icon, play preview button
- Selected: violet border + checkmark
- Preview button shows credit cost on hover: "3 credits"

### Category Selector
- 7 cards in responsive grid
- Each card: sample video (autoplay muted loop), category name, 1-line description
- Selected: violet border, scale(1.02)
- Click → expands to show full description + "Start" button

## Micro-animations
- Page entry: fade + translateY(8px→0), 250ms
- Card hover: border glow + scale(1.01)
- Button press: scale(0.97) active
- Score ring: animated on mount
- Skeleton: shimmer animation for loading states
- Checkpoint completion: checkmark draw animation

## UX Rules
- Show credit cost BEFORE every action — require explicit confirm
- Destructive actions: confirmation modal always
- Loading: skeleton screens, never bare spinners alone
- Empty states: illustrated SVG + clear action button
- Toasts: top-right, 3s auto-dismiss, max 3 stacked
- Mobile-first: all components work at 375px width
- Min touch target: 44x44px everywhere

## Accessibility
- WCAG AA contrast minimum
- aria-live="polite" on all loading/status regions
- Focus rings: visible, violet coloured
- All images: meaningful alt text

## Component Resources
When building new components, use /ui prompt with 21st.dev Magic MCP first, then apply RangManchAI tokens on top. Reference ui.aceternity.com and magicui.design for animation patterns.

