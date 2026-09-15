import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aerial Scene Query",
  description:
    "Language-queryable aerial scene understanding for UAV traffic analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
