import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";

// UI + headings — Inter. The display feel comes from weight, size and tracking,
// not a second face, so the whole console reads as one voice.
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Data — every mono readout: ports, ids, timestamps, table labels, code.
const plexMono = IBM_Plex_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Vargos · Console",
  description:
    "Live console for a running Vargos agent OS — sessions, channels, cron, models, MCP, agents and memory, streamed over WebSocket.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${plexMono.variable}`}
    >
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("vargos-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
        {/* Fixed full-bleed HUD backdrop — blueprint grid + faint reactor bloom. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 hud-grid-bg"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed -top-40 left-1/2 -z-10 h-[36rem] w-[52rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, var(--hud-glow), transparent 70%)",
          }}
        />
        <TooltipProvider>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
