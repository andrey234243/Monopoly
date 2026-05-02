import type {Metadata} from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Digital Assets Tycoon',
  description: 'P2P strategy game for Telegram',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <Script 
          src="https://telegram.org/js/telegram-web-app.js" 
          strategy="beforeInteractive" 
        />
      </head>
      <body suppressHydrationWarning className="bg-black text-white m-0 p-0 overflow-hidden select-none touch-none">
        {children}
      </body>
    </html>
  );
}
