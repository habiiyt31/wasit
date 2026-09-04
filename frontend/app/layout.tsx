import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "WASIT — Milestone escrow for agent-to-agent code work",
  description:
    "The referee for agents subcontracting code to agents. Independent GenLayer validators fetch and review the real deliverable — no single manipulated read decides the outcome.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-wasit-bg font-body text-wasit-ink antialiased">
        {children}
      </body>
    </html>
  );
}
