/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  // Motion rule 25 (R0-AUDIT section 6): hover: utilities apply only under @media (hover: hover),
  // so a tap on a phone never leaves a stuck hover state.
  future: { hoverOnlyWhenSupported: true },
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  // No source uses these yet; e2e/design-foundations.spec.js injects them at runtime. Drop each
  // entry once a component uses it.
  safelist: ['type-record-title', 'type-meta'],
  theme: {
    extend: {
      // The whole radius scale, per docs/design-system/MASTER.md section 5. `xl` is added here
      // because Tailwind's default `xl` is 12px and the contract caps dialogs and sheets at 14px.
      // Nothing in the product may be rounder than `xl`; `rounded-2xl`, `rounded-3xl` and the
      // arbitrary `rounded-[24|26|28|30|32px]` values they replaced are all off-contract.
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      // Named breakpoints from R0-AUDIT section 6, beside Tailwind's defaults.
      screens: {
        compact: '600px',
        tablet: '840px',
        desktop: '1200px',
      },
      fontSize: {
        'page-title': ['1.875rem', '2.25rem'],
        'page-title-lg': ['2.25rem', '2.5rem'],
        'record-title': ['1.5rem', '2rem'],
        'record-title-lg': ['1.875rem', '2.25rem'],
        'section-title': ['1.125rem', '1.75rem'],
        'body-copy': ['1rem', '1.5rem'],
        'field-label': ['0.875rem', '1.25rem'],
        metadata: ['0.75rem', '1rem'],
        'metric-value': ['2rem', '2.25rem'],
        'data-value': ['0.875rem', '1.25rem'],
      },
      // Named rather than overriding Tailwind's own `ease-out`, so existing call sites keep the
      // curve they were tuned with and new motion opts in. Values live in globals.css.
      transitionTimingFunction: {
        'out-strong': 'var(--ease-out)',
        'in-out-strong': 'var(--ease-in-out)',
        drawer: 'var(--ease-drawer)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
      },
      keyframes: {
        // Landing hero entrance. CSS rather than GSAP so it plays on first paint, before hydration.
        // The screenshots move by transform only, so they are visible (and the LCP) from frame one.
        'landing-rise': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        // The indeterminate refresh bar. Travels rather than pulsing, so it reads as "still
        // working" rather than as something blinking for attention.
        // A page arriving. Opacity only: a rise would move content that layout checks measure,
        // and MASTER.md section 7 keeps position changes out of anything this frequent.
        // The sign-in page settling in: a short rise within the section 7 position budget.
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        // The sign-in photograph opens out from a smaller frame while the picture settles back.
        'photo-reveal': {
          '0%': { opacity: '0', 'clip-path': 'inset(12% 12% 12% 12% round 0.5rem)' },
          '100%': { opacity: '1', 'clip-path': 'inset(0 0 0 0 round 0.5rem)' },
        },
        'photo-settle': {
          '0%': { transform: 'scale(1.1)' },
          '100%': { transform: 'none' },
        },
        'page-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'refresh-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        // `backwards`, not `both`: once finished the animation releases transform for GSAP's scroll drift.
        'landing-rise': 'landing-rise 0.7s var(--ease-out) backwards',
        'refresh-sweep': 'refresh-sweep 1.1s ease-in-out infinite',
        'page-in': 'page-in var(--duration-fast) var(--ease-out) both',
        'rise-in': 'rise-in var(--duration-base) var(--ease-out) backwards',
        'photo-reveal': 'photo-reveal 0.7s var(--ease-out) 0.2s backwards',
        'photo-settle': 'photo-settle 1.4s var(--ease-out) 0.2s backwards',
      },
      colors: {
        border: 'hsl(var(--border))',
        rule: {
          DEFAULT: 'hsl(var(--rule))',
          strong: 'hsl(var(--rule-strong))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          ink: 'hsl(var(--destructive-ink))',
          surface: 'hsl(var(--destructive-surface))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          ink: 'hsl(var(--success-ink))',
          surface: 'hsl(var(--success-surface))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          ink: 'hsl(var(--warning-ink))',
          surface: 'hsl(var(--warning-surface))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          ink: 'hsl(var(--info-ink))',
          surface: 'hsl(var(--info-surface))',
        },
        severe: {
          DEFAULT: 'hsl(var(--severe))',
          ink: 'hsl(var(--severe-ink))',
          surface: 'hsl(var(--severe-surface))',
        },
        'surface-2': 'hsl(var(--surface-2))',
        selected: 'hsl(var(--selected))',
        mint: {
          DEFAULT: 'hsl(var(--mint))',
          line: 'hsl(var(--mint-line))',
        },
        brand: 'hsl(var(--brand))',
        gold: {
          surface: 'hsl(var(--gold-surface))',
          ink: 'hsl(var(--gold-ink))',
        },
        deep: 'hsl(var(--deep))',
        faint: 'hsl(var(--faint))',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          border: 'hsl(var(--sidebar-border))',
          foreground: 'hsl(var(--foreground))',
          'muted-foreground': 'hsl(var(--sidebar-muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
