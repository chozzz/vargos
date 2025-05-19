import { Geist, Geist_Mono } from "next/font/google"
import { ThemesProvider } from "@/components/providers/themes-provider"
import "@workspace/ui/globals.css"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased `}
      >
        <ThemesProvider>
          <main className="h-screen w-screen bg-black text-green-400 p-4">
            {children}
          </main>
        </ThemesProvider>
      </body>
    </html>
  )
}
