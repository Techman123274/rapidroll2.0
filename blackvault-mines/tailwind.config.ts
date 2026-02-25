import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: '#0f172a',
          card: '#111827',
          muted: '#1f2937',
          edge: '#334155',
          good: '#10b981',
          bad: '#ef4444',
          text: '#e5e7eb'
        }
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(16,185,129,0.2), 0 12px 25px rgba(0,0,0,0.3)',
        danger: '0 0 0 1px rgba(239,68,68,0.2), 0 12px 25px rgba(0,0,0,0.35)'
      }
    }
  },
  plugins: []
};

export default config;
