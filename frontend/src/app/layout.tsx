import "./globals.css";
import { ReactNode } from "react";

import AuthProvider from "@/lib/auth-client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "SPEWN",
  description: "SPEWN — split your salary",
    icons: {
   icon: "/logo-filled-transparent.png",
     
  },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900 bg-white flex flex-col min-h-screen">
        {/* Accessibility: skip to main content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:rounded shadow"
        >
          Skip to main content
        </a>

        <AuthProvider>
          {/* Header always at top */}
          <Header />

          {/* Main fills entire viewport area */}
          <main
            id="main-content"
            className="flex-1 w-full bg-gradient-to-b from-white via-slate-50 to-white p-0"
          >
            {children}
          </main>

          {/* Footer at bottom */}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}


