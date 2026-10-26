import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Fraunces } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const sans = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson" });
const serif = Fraunces({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "AidBridge", template: "%s · AidBridge" },
  description: "Community assistance, case management, and resource coordination for small organizations.",
  applicationName: "AidBridge",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#143d27", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <a className="skip-link" href="#main">Skip to content</a>
        <div className="min-h-screen">{children}</div>
        <footer className="border-t border-line px-4 py-8 text-center text-sm">
          <p className="font-bold">
            Powered by <Link className="text-pine underline underline-offset-2" href="https://codyza.com" target="_blank" rel="noopener noreferrer">Codyza</Link>
          </p>
          <p className="mt-2 text-ink/70">AidBridge keeps each organization’s records separate.</p>
        </footer>
      </body>
    </html>
  );
}
