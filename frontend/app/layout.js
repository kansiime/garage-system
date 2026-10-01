import './globals.css';

export const metadata = { title: 'Garage Management System' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}