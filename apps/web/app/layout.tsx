import { KeycloakProvider } from "./KeycloakProvider";
import "./globals.css";

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
    <html lang="en">
      <body>
        <KeycloakProvider>{children}</KeycloakProvider>
      </body>
    </html>
  );
}
