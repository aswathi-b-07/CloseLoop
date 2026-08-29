/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Razorpay-inspired light palette (deep brand blue + bright accent)
        rzp: {
          DEFAULT: '#305EFF', // dominant brand blue
          bright: '#3395FF', // bright accent / highlights
          dark: '#1E44D6',
          darker: '#1736B0',
          soft: '#6E8BFF',
          tint: '#EEF3FF',
          tint2: '#F5F8FF',
        },
        navy: {
          DEFAULT: '#0F1B3D',
          900: '#02042B',
          800: '#0D1B3E',
          700: '#162F56',
          600: '#243B66',
          500: '#3A4E78',
        },
        // Alias so any legacy `accent` utilities render as Razorpay blue
        accent: {
          DEFAULT: '#3395FF',
          soft: '#5AA6FF',
          deep: '#1E64E7',
        },
        canvas: '#F4F6FD', // page background
        line: '#E7EAF3', // hairline borders
      },
      boxShadow: {
        card: '0 1px 3px rgba(16,30,54,0.06), 0 10px 28px rgba(16,30,54,0.09)',
        'card-hover': '0 14px 40px rgba(16,30,54,0.14)',
        glow: '0 6px 16px rgba(48,94,255,0.28)',
        nav: '0 1px 0 rgba(16,30,54,0.06), 0 6px 20px rgba(16,30,54,0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
