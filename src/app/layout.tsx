
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import ClientHeader from '@/components/ClientHeader'; // Import ClientHeader

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Metadata remains in the Server Component (layout.tsx)
export const metadata: Metadata = {
  title: 'Creative Academy Booking', // Updated Title
  description: 'Gestore Orario Aule - Generato da Firebase Studio. Data is stored in the /config directory.', // Added note about data storage
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}>
        <ClientHeader /> {/* Add ClientHeader here to be present on all pages */}
        <div className="flex-grow">
         {children}
        </div>
        <Toaster />
      </body>
    </html>
  );
}
