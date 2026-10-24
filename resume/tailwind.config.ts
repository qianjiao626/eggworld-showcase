import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        stone: {
          50: "#fafaf9",
          100: "#f5f5f4",
          200: "#e7e5e4",
          400: "#a8a29e",
          500: "#78716c",
          800: "#292524",
        },
        terracotta: "#ea580c",
        teal: "#0d9488",
      },
    },
  },
  plugins: [],
};
export default config;
