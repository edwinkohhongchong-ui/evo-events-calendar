import type { Metadata } from "next";
import localFont from "next/font/local";
import NavBar from "@/components/NavBar";
import { EventFilterProvider } from "@/lib/eventFilterContext";
import { UndoProvider } from "@/lib/undo/UndoProvider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "+EVO Events Calendar",
  description: "TEVO events planning calendar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UndoProvider>
          <EventFilterProvider>
            <NavBar />
            {children}
          </EventFilterProvider>
        </UndoProvider>
      </body>
    </html>
  );
}
