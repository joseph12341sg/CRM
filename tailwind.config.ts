import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: '#0A0A0A',
          card: '#111111',
          elevated: '#1A1A1A',
          border: '#2A2A2A',
          nav: '#0F0F0F',
          stripe: '#141414',
        },
        gold: {
          DEFAULT: '#C9A84C',
          hover: '#E8C46A',
          muted: '#8B6914',
        },
        text: {
          primary: '#F5F5F5',
          secondary: '#A0A0A0',
          muted: '#5A5A5A',
        },
        danger: '#E05252',
        success: '#4CAF7D',
        warning: '#E8A838',
      },
      fontFamily: {
        heading: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      boxShadow: {
        'gold-sm': '0 0 0 1px rgba(201,168,76,0.05)',
        'gold-md': '0 0 0 1px rgba(201,168,76,0.1), 0 4px 12px rgba(0,0,0,0.3)',
        'gold-glow': '0 0 20px rgba(201,168,76,0.1)',
      },
    },
  },
  plugins: [],
};
export default config;
