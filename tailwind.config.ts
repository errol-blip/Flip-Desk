import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14171C',
        paper: '#F7F7F5',
        surface: '#FFFFFF',
        line: '#E4E4E1',
        muted: '#6B6F76',
        brand: {
          50: '#EEF4FF',
          100: '#DCE8FF',
          400: '#4C7CF0',
          500: '#2E5CE0',
          600: '#1F45B8',
        },
        score: {
          excellent: '#1F8A5C',
          good: '#3D7DD6',
          marginal: '#C98A1B',
          pass: '#B8452F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
