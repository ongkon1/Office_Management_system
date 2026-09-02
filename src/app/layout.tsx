import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { ToastProvider } from '@/components/feedback/toast';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
  // Only the weights the type scale actually uses.
  weight: ['400', '500', '600', '700'],
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'Timesheet',
    // Page titles read "{Page} · {Section} · Timesheet" (FE-0011).
    template: '%s · Timesheet',
  },
  description:
    'Multi-division employee timesheet and work management system for recording time, tasks, attendance, and verified reporting.',
  applicationName: 'Timesheet',
  // An internal system must never be indexed or previewed by a crawler.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled: capping it fails WCAG 2.2 AA (REQ-NFR-UX-003).
  maximumScale: 5,
  userScalable: true,
  themeColor: '#f7f5f1',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
