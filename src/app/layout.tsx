import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

// Fonts load in the browser at runtime (see <link> below) so the build
// never depends on fetching anything from Google — hermetic builds.

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Space+Grotesk:wght@500..700&display=swap"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
