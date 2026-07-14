import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Montfort Money",
  description:
    "Budgets, spending and money tasks in one place. Part of the Montfort family.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Montfort Money",
  },
};

export const viewport: Viewport = {
  themeColor: "#070b0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("mf-theme");
    if (t === "light") document.documentElement.classList.add("theme-light");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${display.variable} ${body.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
