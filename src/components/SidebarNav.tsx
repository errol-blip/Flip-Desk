'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Search,
  ListChecks,
  Gavel,
  Boxes,
  Tag,
  DollarSign,
  BarChart3,
  Settings as SettingsIcon,
  Layers,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/deal-finder', label: 'Deal Finder', icon: Search },
  { href: '/watchlist', label: 'Watchlist', icon: ListChecks },
  { href: '/bulk-add', label: 'Bulk Add', icon: Layers },
  { href: '/auctions', label: 'Auctions', icon: Gavel },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/listings', label: 'Listings', icon: Tag },
  { href: '/sales', label: 'Sales', icon: DollarSign },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-brand-50 text-brand-600' : 'text-muted hover:bg-line/40 hover:text-ink'
            )}
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const primary = NAV.slice(0, 5);
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t border-line bg-surface/95 backdrop-blur md:hidden">
      {primary.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              active ? 'text-brand-600' : 'text-muted'
            )}
          >
            <Icon size={19} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
