import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Institution Sustainability Rating Platform",
  description:
    "Financial institution sustainability ratings, evidence governance, maker-checker review, certificates, and trend analysis for Nigeria's financial sector.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-color-theme="amber">
      <body>{children}</body>
    </html>
  );
}
