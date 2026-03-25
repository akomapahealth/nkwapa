import { Source_Serif_4, IBM_Plex_Sans, Poppins } from "next/font/google";
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

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-landing",
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
    <html lang="en" className={`${sourceSerif.variable} ${ibmPlexSans.variable} ${poppins.variable}`}>
      <head>
        <link
          href="https://fonts.cdnfonts.com/css/circular-std"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <KeycloakProvider>{children}</KeycloakProvider>
      </body>
    </html>
  );
}
