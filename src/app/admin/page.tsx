'use client';
import { useState } from 'react';
import AdminOverview from '@/components/AdminOverview';
import Reports from '@/components/Reports';
import TeamAdmin from '@/components/TeamAdmin';
import { Shell } from '@/components/ui';

const TABS = [['overview', 'Risk overview'], ['teams', 'Teams & allocation'], ['reports', 'Reports']] as const;

export default function Page() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('overview');
  return (
    <Shell allow={['coordinator', 'admin']} title="Coordinator overview">
      <nav className="flex flex-wrap gap-2 rounded-xl border border-paper-rule bg-paper-raised p-1.5 shadow-card" aria-label="Coordinator navigation">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${tab === id ? 'bg-pulse text-white' : 'text-ink-soft hover:bg-paper'}`}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && <AdminOverview />}
      {tab === 'teams' && <TeamAdmin />}
      {tab === 'reports' && <Reports />}
    </Shell>
  );
}
