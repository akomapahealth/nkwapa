import { Source_Serif_4, IBM_Plex_Sans } from "next/font/google";
import { KeycloakProvider } from "./KeycloakProvider";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Nkwapa EMR",
  description:
    "Nkwapa EMR - Multi-clinic hypertension and diabetes workflows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${ibmPlexSans.variable}`}>
      <body>
        <KeycloakProvider>{children}</KeycloakProvider>
      </body>
    </html>
  );
}
