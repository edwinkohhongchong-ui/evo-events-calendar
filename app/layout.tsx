import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import NavBar from "@/components/NavBar";
import { EventFilterProvider } from "@/lib/eventFilterContext";
import { UndoProvider } from "@/lib/undo/UndoProvider";
import { RoleProvider } from "@/lib/roleContext";
import { Role } from "@/lib/auth";
import { getGeneralComments } from "@/lib/data";
import { OnboardingTourProvider } from "@/lib/useOnboardingTour";
import OnboardingTourModal from "@/components/OnboardingTourModal";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set by middleware.ts from the validated auth cookie — absent on the
  // /login page itself (excluded from the middleware matcher), where
  // "editor" as a fallback is harmless since NavBar renders nothing there.
  const roleHeader = (await headers()).get("x-evo-role") as Role | null;
  const role = roleHeader ?? "editor";
  // General Notes drawer (top bar) — only fetched for signed-in requests.
  const generalComments = roleHeader ? await getGeneralComments() : [];

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <RoleProvider role={role}>
          <UndoProvider>
            <EventFilterProvider>
              <OnboardingTourProvider>
                <NavBar generalComments={generalComments} />
                {children}
                <OnboardingTourModal />
              </OnboardingTourProvider>
            </EventFilterProvider>
          </UndoProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
