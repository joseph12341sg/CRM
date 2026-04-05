import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "North Star Ventures CRM",
  description: "Multi-tenant CRM for digital marketing agencies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-dark text-text-primary">
        {children}
      </body>
    </html>
  );
}
