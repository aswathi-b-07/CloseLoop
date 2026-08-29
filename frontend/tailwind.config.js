/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fintech dark theme palette
        ink: {
          950: '#0a0e17',
          900: '#0d1220',
          850: '#111827',
          800: '#151c2c',
          750: '#1b2334',
          700: '#232c40',
          600: '#2e3850',
        },
        accent: {
          DEFAULT: '#2dd4bf', // teal
          soft: '#5eead4',
          deep: '#14b8a6',
        },
        indigo2: {
          DEFAULT: '#6366f1',
          soft: '#818cf8',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)',
        glow: '0 0 0 1px rgba(45,212,191,0.25), 0 8px 30px rgba(45,212,191,0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        'slide-in': 'slide-in 0.3s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}
