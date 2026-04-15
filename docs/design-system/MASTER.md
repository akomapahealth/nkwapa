# Nkwapa EMR Design System (from ui-ux-pro-max)

## Pattern

- **Minimal & Direct** — CTA above fold; Hero → Features → CTA
- For dashboards: role-specific KPIs + primary CTA; 2–3 charts; MUI table

## Style

- **Flat Design** — 2D, minimalist, bold colors, no shadows, clean lines, typography-focused
- Best for: Web apps, SaaS, dashboards, corporate
- Performance: Excellent | Accessibility: WCAG AAA

## Colors (reference; project uses existing teal/amber in globals.css)

- Primary: teal (hsl 191 98% 36%) — keep
- Secondary: amber (hsl 43 84% 55%) — keep
- Chart tokens: --chart-1 through --chart-5 already defined

## Typography

- Heading: font-heading (Georgia/serif)
- Body: font-body (system-ui)
- For data-heavy: Fira Sans / Fira Code optional for analytics views

## Effects

- No gradients/shadows on clinical views
- Simple hover: color/opacity shift
- Transitions: 150–200ms ease
- Minimal icons (Lucide only)

## Anti-patterns to avoid

- Complex onboarding flow
- Cluttered layout
- Emoji as icons
- Layout shift on hover (no scale transforms)

## Pre-delivery checklist

- [ ] No emojis as icons (use Lucide/Heroicons)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150–300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
