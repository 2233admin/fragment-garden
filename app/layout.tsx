import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "碎片花园",
  description: "碎片花园项目基础环境",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
