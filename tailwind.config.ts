import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F2F0EB",
        paper: "#FBFAF7",
        ink: "#151719",
        muted: "#686B69",
        line: "#D7D5CF",
        crimson: "#C8102E",
      },
      boxShadow: {
        instrument: "12px 12px 0 rgba(21, 23, 25, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
