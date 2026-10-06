import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Giovetta Living | La vita, con stile",
  description:
    "Odkryj Giovetta Living — przemyślane dodatki do domu i codziennego życia, naturalna estetyka i ponadczasowy styl.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
