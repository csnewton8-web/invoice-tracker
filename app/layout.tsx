import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-neutral-900 to-neutral-800 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}