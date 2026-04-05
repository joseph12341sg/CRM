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
        navy: {
          DEFAULT: '#0F1B2D',
          50: '#E8EBF0',
          100: '#C5CCD8',
          200: '#8A99B0',
          300: '#506688',
          400: '#2D4060',
          500: '#0F1B2D',
          600: '#0C1624',
          700: '#09101B',
          800: '#060B12',
          900: '#030509',
        },
        gold: {
          DEFAULT: '#C9A84C',
          50: '#FBF6E8',
          100: '#F5EAC8',
          200: '#EDD89F',
          300: '#E2C36E',
          400: '#C9A84C',
          500: '#B0923D',
          600: '#8C7430',
          700: '#685624',
          800: '#443818',
          900: '#221C0C',
        },
      },
    },
  },
  plugins: [],
};
export default config;
