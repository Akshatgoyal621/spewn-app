import "./globals.css";
import {ReactNode} from "react";

import AuthProvider from "@/lib/auth-client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "SPEWN",
  description: "SPEWN — split your salary",
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="mx-auto">
            <Header />
            <main>{children}</main>
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
