import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        kolia: {
          ink: "#102033",
          midnight: "#0A1422",
          green: "#0F8C6F",
          mint: "#DFF4ED",
          gold: "#C89A2D",
          amber: "#FFF5D8",
          line: "#DCE5EA"
        }
      },
      boxShadow: {
        soft: "0 18px 55px rgba(16, 32, 51, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
