import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeScript } from "@/components/layout/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SPS ERP",
    template: "%s | SPS ERP",
  },
  description: "SPS ERP — school management for SPS School.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets the `dark` class before React hydrates.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} scroll-smooth antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Browser extensions (password managers, antivirus) add attributes to
          <body> before React starts; don't report those as mismatches. */}
      <body className="min-h-screen bg-background font-sans text-foreground" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
