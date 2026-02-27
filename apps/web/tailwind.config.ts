import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--color-bg))',
        surface: 'hsl(var(--color-surface))',
        elevated: 'hsl(var(--color-elevated))',
        text: 'hsl(var(--color-text))',
        muted: 'hsl(var(--color-muted))',
        border: 'hsl(var(--color-border))',
        accent: 'hsl(var(--color-accent))',
        'accent-contrast': 'hsl(var(--color-accent-contrast))',
        success: 'hsl(var(--color-success))',
        danger: 'hsl(var(--color-danger))'
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)'
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        hard: 'var(--shadow-hard)'
      }
    }
  },
  plugins: []
};

export default config;
