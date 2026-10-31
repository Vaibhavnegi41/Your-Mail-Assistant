import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        app: '#030712',
        sidebar: '#060a14',
        surface: '#0b1120',
        'subtle-border': 'rgba(255, 255, 255, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 25px rgba(59, 130, 246, 0.15)',
        modal: '0 25px 60px -15px rgba(0, 0, 0, 0.85)',
      },
    },
  },
  plugins: [],
};

export default config;
