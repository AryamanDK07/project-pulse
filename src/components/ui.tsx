'use client';
import { useState, type ReactNode } from 'react';
import { api, useFetch } from '@/lib/client';
import type { SessionUser } from '@/lib/types';

/* ─── SVG Icons (inline, lightweight, no dependencies) ─────────────── */
export const Icon = ({ name, className = "w-4 h-4" }: { name: string; className?: string }) => {
  switch (name) {
    case 'pulse':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'logout':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    case 'chevronDown':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
    case 'user':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'database':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
    case 'alert':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case 'check':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
    case 'search':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case 'refresh':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>;
    case 'filter':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
    case 'file':
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>;
    default:
      return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>;
  }
};

/* ─── Database Paradigm Tag ────────────────────────────────────────── */
export function DbTag({ type, label }: { type: 'sql' | 'mongo' | 'vector' | 'hybrid'; label?: string }) {
  const configs = {
    sql: { name: label ?? 'PostgreSQL', bg: 'bg-blue-50 text-blue-700 ring-blue-200/80', dot: 'bg-blue-500' },
    mongo: { name: label ?? 'MongoDB', bg: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80', dot: 'bg-emerald-500' },
    vector: { name: label ?? 'pgvector', bg: 'bg-purple-50 text-purple-700 ring-purple-200/80', dot: 'bg-purple-500' },
    hybrid: { name: label ?? 'Dual DB (SQL+NoSQL)', bg: 'bg-amber-50 text-amber-700 ring-amber-200/80', dot: 'bg-amber-500' },
  }[type];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${configs.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${configs.dot}`} />
      {configs.name}
    </span>
  );
}

/* ─── Tone map for Badges ─────────────────────────────────────────── */
const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200/80',
  red: 'bg-red-50 text-red-700 ring-red-200/80',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200/80',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200/80',
};

export function statusTone(s: string): keyof typeof TONES {
  if (['approved', 'verified', 'resolved', 'completed', 'done', 'low', 'acceptable'].includes(s)) return 'green';
  if (['submitted', 'under_review', 'in_progress', 'proposed', 'medium', 'commented'].includes(s)) return 'blue';
  if (['changes_requested', 'revision_requested', 'high', 'open', 'blocked', 'pending'].includes(s)) return 'amber';
  if (['critical', 'rejected', 'duplicate', 'plagiarism_suspected'].includes(s)) return 'red';
  return 'slate';
}

export function Badge({ value, tone }: { value: string; tone?: keyof typeof TONES }) {
  const chosen = tone ?? statusTone(value);
  const t = TONES[chosen] ?? TONES.slate;
  const dotColor =
    chosen === 'green' ? 'bg-emerald-500' :
    chosen === 'red' ? 'bg-red-500' :
    chosen === 'amber' ? 'bg-amber-500' :
    chosen === 'blue' ? 'bg-sky-500' :
    chosen === 'purple' ? 'bg-violet-500' : 'bg-slate-400';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${t}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/* ─── Card / Panel Component ───────────────────────────────────────── */
export function Panel({
  title,
  subtitle,
  action,
  db,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  db?: 'sql' | 'mongo' | 'vector' | 'hybrid';
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-paper-rule bg-paper-raised shadow-card overflow-hidden transition-all duration-200 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-rule bg-gradient-to-r from-paper-raised via-paper-raised to-paper/60 px-5 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pulse" />
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {db && <DbTag type={db} />}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-ink-faint ml-4">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export const Card = Panel;

/* ─── Button Component ─────────────────────────────────────────────── */
export function Btn({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const cls =
    variant === 'primary' ? 'btn-primary' :
    variant === 'danger' ? 'btn-danger' :
    'btn-ghost';

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${cls} ${className}`}>
      {children}
    </button>
  );
}

export const inputCls = 'input-field';

export function Notice({ error }: { error: string | null }) {
  return error ? (
    <div role="alert" className="animate-scale-in flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800 shadow-sm">
      <span className="mt-0.5 flex-shrink-0 text-red-500"><Icon name="alert" /></span>
      <span className="font-medium">{error}</span>
    </div>
  ) : null;
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <div className="rounded-full bg-paper p-3 mb-3 border border-paper-rule text-ink-faint">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
    </div>
    <p className="text-sm text-ink-faint">{children}</p>
  </div>
);

export function Stat({
  label,
  value,
  tone,
  icon,
  db,
}: {
  label: string;
  value: ReactNode;
  tone?: 'red' | 'amber';
  icon?: ReactNode;
  db?: 'sql' | 'mongo' | 'vector';
}) {
  return (
    <div className="stat-card group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
          {db && <DbTag type={db} />}
        </div>
        {icon && <span className="text-ink-muted group-hover:text-pulse transition-colors">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${
        tone === 'red' ? 'text-danger' : tone === 'amber' ? 'text-warning' : 'text-ink'
      }`}>
        {value}
      </p>
    </div>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-pulse' :
    pct >= 25 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2.5" aria-label={`${pct}% complete`}>
      <div className="h-2 w-28 rounded-full bg-paper-rule overflow-hidden">
        <div className={`h-2 rounded-full ${color} transition-all duration-500 ease-out`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-ink-soft">{pct}%</span>
    </div>
  );
}

/** Page Shell: loads session, enforces role access, renders modern header with nav & user profile. */
export function Shell({
  allow,
  title,
  children,
}: {
  allow: string[];
  title: string;
  children: ReactNode;
}) {
  const { data, error } = useFetch<{ user: SessionUser }>('/api/auth/me');
  const [menuOpen, setMenuOpen] = useState(false);

  if (error) return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-paper">
      <div className="text-center animate-fade-in max-w-sm rounded-xl border border-red-200 bg-paper-raised p-6 shadow-card">
        <div className="rounded-full bg-red-100 p-3 mx-auto w-fit mb-3 text-red-600"><Icon name="alert" /></div>
        <p className="text-sm font-semibold text-ink">{error}</p>
        <a className="mt-3 inline-block text-xs font-medium text-pulse hover:text-pulse-dark underline" href="/login">Sign in again</a>
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="text-center animate-fade-in flex flex-col items-center">
        <svg className="animate-spin h-6 w-6 text-pulse mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <p className="text-sm font-medium text-ink-soft">Loading workspace…</p>
      </div>
    </div>
  );

  if (!data.user.roles.some((r) => allow.includes(r)))
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-paper">
        <div className="text-center animate-fade-in max-w-md rounded-xl border border-paper-rule bg-paper-raised p-8 shadow-card">
          <div className="rounded-full bg-amber-100 p-3 mx-auto w-fit mb-3 text-amber-700"><Icon name="alert" /></div>
          <h2 className="text-base font-semibold text-ink">Access Restricted</h2>
          <p className="mt-1 text-sm text-ink-soft">Your account does not have access to this view.</p>
          <a className="mt-4 inline-block rounded-lg bg-pulse px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-pulse-dark transition-colors" href="/">
            Go to My Home
          </a>
        </div>
      </div>
    );

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const navLinks = [
    ...(data.user.roles.includes('student') ? [{ href: '/student', label: 'Student Workspace' }] : []),
    ...(data.user.roles.includes('faculty') || data.user.roles.includes('coordinator') || data.user.roles.includes('admin')
      ? [{ href: '/faculty', label: 'Guide Dashboard' }] : []),
    ...(data.user.roles.includes('reviewer') ? [{ href: '/reviewer', label: 'Reviewer Workspace' }] : []),
    ...(data.user.roles.includes('coordinator') || data.user.roles.includes('admin')
      ? [{ href: '/admin', label: 'Coordinator Overview' }] : []),
    { href: '/about', label: 'DBMS Architecture' },
  ];

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Top Navbar */}
      <header className="glass-header sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pulse/20 text-pulse-ring group-hover:bg-pulse/30 transition-colors shadow-sm">
                <Icon name="pulse" className="w-5 h-5 text-pulse-light" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-pulse-ring">Project Pulse</span>
                  <span className="rounded bg-white/10 px-1 py-0.2 text-[9px] font-mono text-slate-300">Level 3</span>
                </div>
                <h1 className="text-sm font-semibold text-white leading-tight">{title}</h1>
              </div>
            </a>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 mr-2">
              {navLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            {/* User Profile dropdown */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition-all hover:bg-white/10"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pulse text-white text-[11px] font-bold">
                  {data.user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline font-medium">{data.user.name}</span>
                <Icon name="chevronDown" className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {menuOpen && (
                <div className="animate-scale-in absolute right-0 mt-2 w-60 rounded-xl border border-paper-rule bg-paper-raised p-1.5 shadow-modal z-50">
                  <div className="px-3 py-2.5 border-b border-paper-rule mb-1 bg-paper/50 rounded-lg">
                    <p className="text-xs font-semibold text-ink">{data.user.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {data.user.roles.map((r) => (
                        <span key={r} className="rounded bg-pulse-tint px-1.5 py-0.5 text-[10px] font-semibold text-pulse-dark">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Mobile nav links */}
                  <div className="md:hidden py-1 border-b border-paper-rule mb-1">
                    {navLinks.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-ink-soft hover:bg-paper hover:text-ink transition-colors"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>

                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-danger hover:bg-red-50 transition-colors"
                  >
                    <Icon name="logout" className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl flex-1 w-full space-y-6 px-4 py-6 sm:px-6">{children}</main>

      {/* Footer */}
      <footer className="border-t border-paper-rule bg-paper-raised/60 py-4 text-center text-xs text-ink-faint">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Project Pulse · DBMS Experiential Learning Project (Level 3)</span>
          <div className="flex items-center gap-2">
            <DbTag type="sql" label="PostgreSQL" />
            <DbTag type="mongo" label="MongoDB" />
            <DbTag type="vector" label="pgvector" />
          </div>
        </div>
      </footer>
    </div>
  );
}
