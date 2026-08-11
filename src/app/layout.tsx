import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/nav/Header";

// 所有页面都依赖运行时数据（SQLite + 调用 LLM），不做静态预渲染
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "HotWriter - 个人热点写作助手",
  description: "输入主题，Agent 自动调研，给你多个写作方向",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <Header />
        <main className="min-h-[calc(100vh-56px)]">{children}</main>
      </body>
    </html>
  );
}
