import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "碎片花园",
  description: "把暂时不处理、但也不想忘记的内容种下来。",
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
