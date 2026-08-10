import type { Config } from 'tailwindcss';

// Brand tokens kept 1:1 with sparrow-website so the portal shares the public
// site's visual language (per Susanna's System Brief).
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sparrow: {
          green: '#1E4D30',
          'green-dark': '#163A24',
          gold: '#F0A500',
          ink: '#1A1A1A',
          gray: '#767676',
          rule: '#D8D8D8',
          mist: '#F5F5F5',
          sage: '#E8F2EC',
          cream: '#FFF8E1',
          dark: {
            bg: '#141416',
            surface: '#1C1D1F',
            surface2: '#242628',
            border: '#33353A',
            ink: '#F2F2F0',
            gray: '#9A9A9E',
            green: '#5FB37D',
          },
        },
        priority: {
          p1: '#DC2626',
          p2: '#F0A500',
          p3: '#2563EB',
          p4: '#9CA3AF',
        },
      },
      fontFamily: {
        serif: ['"Fraunces Variable"', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'system-ui', 'Arial', 'sans-serif'],
      },
      maxWidth: { content: '72rem' },
      borderRadius: { '2xl': '1rem' },
      boxShadow: {
        card: '0 1px 3px rgba(26,26,26,0.06), 0 1px 2px rgba(26,26,26,0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
