import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

// Fonts load in the browser at runtime (see <link> below) so the build
// never depends on fetching anything from Google — hermetic builds.

export const metadata: Metadata = {
  metadataBase: new URL("https://montfortmoney.com"),
  title: "Montfort Money — know your month before it happens",
  description:
    "Plan your month, see the days you'd come up short before they happen, and let Montfort AI do the math. Debts, goals, trips and couples in one place.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: "https://montfortmoney.com",
    siteName: "Montfort Money",
    title: "Montfort Money — know your month before it happens",
    description: "See the days you'd come up short, plan with Montfort AI, and split trips with friends.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Montfort Money" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Montfort Money — know your month before it happens",
    description: "See the days you'd come up short, plan with Montfort AI, and split trips with friends.",
    images: ["/og.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Montfort Money",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f8fc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("mf-theme");
    // light is the default; dark only if the person chose it
    if (t !== "dark") document.documentElement.classList.add("theme-light");
  } catch (e) { document.documentElement.classList.add("theme-light"); }
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
        <RegisterSW />
        <Analytics />
      </body>
    </html>
  );
}
