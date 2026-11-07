import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f172a', soft: '#475569', faint: '#94a3b8', muted: '#cbd5e1' },
        paper: { DEFAULT: '#f8fafc', raised: '#ffffff', rule: '#e2e8f0', hover: '#f1f5f9' },
        pulse: { DEFAULT: '#0d9488', dark: '#0f766e', light: '#99f6e4', tint: '#f0fdfa', ring: '#5eead4' },
        accent: { DEFAULT: '#6366f1', light: '#a5b4fc', tint: '#eef2ff' },
        success: { DEFAULT: '#059669', light: '#d1fae5', text: '#065f46' },
        warning: { DEFAULT: '#d97706', light: '#fef3c7', text: '#92400e' },
        danger: { DEFAULT: '#dc2626', light: '#fee2e2', text: '#991b1b' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        elevated: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        modal: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.08)',
        glow: '0 0 20px -5px rgb(13 148 136 / 0.3)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
};
export default config;
