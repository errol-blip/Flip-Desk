import Link from 'next/link';
import { SidebarNav, BottomNav } from '@/components/SidebarNav';
import { Plus } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
          <div className="mb-6 px-2">
            <div className="text-base font-semibold tracking-tight">Flip Desk</div>
            <div className="text-xs text-muted">Liquidation Sourcing</div>
          </div>
          <SidebarNav />
          <Link
            href="/watchlist/add"
            className="mt-6 flex items-center justify-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            <Plus size={16} /> Add MAC.BID Product
          </Link>
        </aside>

        <main className="min-h-screen flex-1 pb-20 md:pb-0">
          <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
            <div className="text-base font-semibold">Flip Desk</div>
            <Link
              href="/watchlist/add"
              className="flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white"
            >
              <Plus size={15} /> Add
            </Link>
          </header>
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
