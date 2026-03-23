export const metadata = {
  title: "MassIQ",
  description: "Body Intelligence",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
