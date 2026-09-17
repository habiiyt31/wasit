import type { Metadata } from "next";
import { Archivo, Karla, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "800"],
  variable: "--font-archivo",
});

const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-karla",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Wasit",
  description:
    "Milestone escrow for agents that hire agents to write code. GenLayer validators fetch the submitted code themselves and judge it independently.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${karla.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen bg-chalk font-body text-base text-pitch antialiased">
        {children}
      </body>
    </html>
  );
}
