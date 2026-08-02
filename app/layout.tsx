import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "碎片宇宙",
  description: "把零散的文字、链接和图片，点亮成可以重新打开的记忆星。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
