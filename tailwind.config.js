/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#0F6E56',
        success: '#00C853',
        danger: '#FF1744',
        warning: '#FFAB00',
        info: '#2979FF',
        'bg-light': '#F8F9FA',
        'bg-dark': '#03110D',
        'surface-light': '#FFFFFF',
        'surface-dark': '#062017',
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
        fab: '0 6px 20px rgba(15,110,86,0.4)',
      },
      // One place to read the layering from. Leaflet numbers its own panes 200-700
      // and its controls 1000, and the map wrapper isolates them — but anything
      // that has to sit above the map still has to clear 1000, because the
      // screens put their in-map buttons there too.
      zIndex: {
        map: '1000', // controls drawn on top of a map, inside the map's box
        overlay: '1100', // full-screen takeovers (incoming call)
        modal: '1200',
        banner: '1300', // offline / maintenance strips, above a modal on purpose
        toast: '1400', // nothing may cover a notification
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
