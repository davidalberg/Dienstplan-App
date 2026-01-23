import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AssistenzPlus Stundennachweis",
  description: "Einfache Zeiterfassung für AssistenzPlus Mitarbeiter",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <SessionProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: 'white',
                color: 'black',
                border: '1px solid #e5e7eb',
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
