import './globals.css';

export const metadata = {
  title: 'Nkwapa EMR',
  description: 'Nkwapa EMR - Multi-clinic hypertension and diabetes workflows',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.cdnfonts.com/css/circular-std" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
