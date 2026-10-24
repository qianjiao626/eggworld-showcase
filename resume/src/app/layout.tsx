import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大师兄牛啵网 - 助力大学生开启职场未来",
  description: "22+ 份大厂原版简历细节无损还原，前大厂面试官 AI 驱动的 1:1 深度对标工具，帮大学生搞定简历和职业规划。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
