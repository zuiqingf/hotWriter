import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        // 长文阅读：中文优先衬线
        serif: [
          "Source Serif Pro",
          "Noto Serif SC",
          "Songti SC",
          "Georgia",
          "serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Notion 风深静青（替换原 brand 紫色）
        // 主色 #2C5BFF，10 档色阶
        ink: {
          // 中性灰阶（文本/边框）—— 极克制、几乎只用 4 档
          900: "#1A1A1A",  // 主文本
          700: "#3F3F3F",  // 副文本
          500: "#6B6B6B",  // 三级文本
          300: "#B5B5B5",  // 弱化文本 / 占位
          100: "#E8E8E8",  // 强分隔
          50:  "#F4F4F4",  // 弱分隔 / 灰底
        },
        // 主品牌色（深静青），替代原 brand
        accent: {
          50:  "#EEF2FF",
          100: "#DCE5FF",
          200: "#B8CCFF",
          400: "#5B7CFF",
          500: "#2C5BFF",  // 主色
          600: "#1E47D9",
          700: "#1737AB",
        },
        // 状态色（克制的低饱和）
        success: { 500: "#0F7B3E", 50: "#E6F4EB" },
        warn:    { 500: "#B45309", 50: "#FEF3C7" },
        danger:  { 500: "#B91C1C", 50: "#FEE2E2" },
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",   // 卡片 / 按钮
        lg: "12px",       // modal / 大卡片
        xl: "16px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.04)",
        DEFAULT: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        md: "0 4px 12px rgba(0,0,0,0.06)",
        lg: "0 12px 32px rgba(0,0,0,0.08)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;