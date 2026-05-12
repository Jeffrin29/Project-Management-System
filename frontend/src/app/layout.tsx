import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "../components/dashboard/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "LANSUB",
  icons: {
    icon: [
      { url: "/images/logog.png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>

      <body className={`${inter.variable} ${inter.className} bg-[#f1f5f9] text-gray-900 dark:bg-[#0b0f19] dark:text-white font-sans`}>

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>

      </body>

    </html>
  );
}