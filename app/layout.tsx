import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "John Branyan's Overlap Comedy Engine",
  description: "Stateless two-phase overlap analysis report generator"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-screen max-w-5xl p-6">{children}</main>
      </body>
    </html>
  );
}
