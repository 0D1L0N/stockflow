/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1e3a5f',
          50:  '#eef3f9',
          100: '#d6e2f0',
          200: '#adc4e0',
          300: '#7f9fc9',
          400: '#5a80b2',
          500: '#3d6597',
          600: '#2c4f7c',
          700: '#1e3a5f',
          800: '#152a46',
          900: '#0c1a2e',
        },
        secondary: {
          DEFAULT: '#10b981',
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        danger:  '#ef4444',
        warning: '#f59e0b',
        info:    '#3b82f6',
        background: '#f5f6f8',
        // Encre : structure (menu, en-têtes forts, écran de connexion)
        ink: {
          DEFAULT: '#0b1220',
          950: '#070c17',
          900: '#0b1220',
          800: '#131c30',
          700: '#1d2842',
          600: '#2b3854',
          400: '#7b879f',
          300: '#a6b0c3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Titres et montants
        display: ['"Plus Jakarta Sans Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      boxShadow: {
        // Ombres douces et superposées : relief discret sur fond clair
        card: '0 1px 2px rgba(15,23,42,0.04)',
        'card-hover': '0 2px 8px rgba(15,23,42,0.06)',
        modal: '0 24px 48px -12px rgba(15,23,42,0.25), 0 8px 16px -8px rgba(15,23,42,0.15)',
        sticky: '0 -4px 16px rgba(15,23,42,0.06)',
        glow: '0 4px 14px -4px rgba(16,185,129,0.4)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.6)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slide-in-right 250ms cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 450ms cubic-bezier(0.34,1.56,0.64,1) both',
      },
    },
  },
  plugins: [],
}
