/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#7B3FE4',
        success: '#00C853',
        danger: '#FF1744',
        warning: '#FFAB00',
        info: '#2979FF',
        'bg-light': '#F8F9FA',
        'bg-dark': '#121212',
        'surface-light': '#FFFFFF',
        'surface-dark': '#1E1E1E',
        'text-light': '#1A1A2E',
        'text-dark': '#E8E8E8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        btn: '24px',
        sheet: '16px',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,0.08)',
        fab: '0 6px 20px rgba(123,63,228,0.4)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'toast-in': {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
      },
      animation: {
        'slide-up': 'slide-up 300ms ease-out',
        'toast-in': 'toast-in 200ms ease-out',
        ripple: 'ripple 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
