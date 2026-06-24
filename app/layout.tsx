import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";
import "rsuite/dist/rsuite.min.css";

export const metadata: Metadata = {
  title: "Kolia Competitor Intelligence Tracker",
  description: "Dashboard demo theo dõi, phân tích và chuẩn hóa nghiên cứu đối thủ cho Kolia Phan.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><rect width='128' height='128' rx='24' fill='%233B82F6'/><text x='64' y='84' font-family='system-ui, sans-serif' font-size='48' font-weight='bold' fill='white' text-anchor='middle'>KP</text></svg>",
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
