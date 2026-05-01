/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        obsidian: '#0A0A0A',
        alabaster: '#FDFDFD',
        ecru: '#FAF9F6',
        'lab-border': '#1F1F1F',
        'lab-border-light': '#F1F1F1',
        indigo_electric: '#5B5BF6',
        cobalt: '#1E40AF',
        burgundy: '#6B1E2B',
      },
      boxShadow: {
        boutique: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        glow: '0 0 0 1px rgba(91,91,246,0.35), 0 8px 40px rgba(91,91,246,0.18)',
      },
      backgroundImage: {
        'grid-dark':
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
        'grid-light':
          'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.05) 1px, transparent 0)',
      },
    },
  },
  plugins: [],
};
