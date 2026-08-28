import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMI — Digital Marketing Inspection",
  description:
    "Automated Digital Marketing Inspection for automotive repair shops: website, SEO, advertising and social media.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
