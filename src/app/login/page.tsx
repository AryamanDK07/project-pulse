'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Btn, inputCls, Notice } from '@/components/ui';

const DEMO = [
  { label: 'Student', email: 'alice@pulse.edu', icon: '🎓' },
  { label: 'Faculty guide', email: 'guide1@pulse.edu', icon: '👨‍🏫' },
  { label: 'Faculty (proposal)', email: 'guide2@pulse.edu', icon: '📝' },
  { label: 'Reviewer', email: 'reviewer@pulse.edu', icon: '🧾' },
  { label: 'Coordinator', email: 'coordinator@pulse.edu', icon: '📋' },
  { label: 'Admin', email: 'admin@pulse.edu', icon: '🔑' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('alice@pulse.edu');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const { home } = await api<{ home: string }>('/api/auth/login', { method: 'POST', json: { email, password } });
      window.location.href = home;
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="relative flex min-h-screen">
      {/* Left decoration panel */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-ink via-slate-800 to-ink p-12">
        <div className="max-w-md text-center animate-fade-in">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-pulse/20 shadow-glow">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pulse-ring">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white">Project Pulse</h2>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">
            Academic project governance, originality verification, and milestone risk monitoring — all in one platform.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { icon: '📊', title: 'Risk Dashboard', desc: 'Monitor project health scores' },
              { icon: '🔍', title: 'Originality Check', desc: 'Vector similarity detection' },
              { icon: '📅', title: 'Milestones', desc: 'Track delivery & feedback' },
              { icon: '👥', title: 'Contributions', desc: 'Individual effort tracking' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl bg-white/5 p-4 text-left backdrop-blur-sm border border-white/10">
                <span className="text-2xl">{f.icon}</span>
                <p className="mt-2 text-sm font-semibold text-white">{f.title}</p>
                <p className="text-xs text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <main className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-12">
        <div className="mx-auto w-full max-w-md animate-slide-up">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pulse/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pulse">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
            <p className="mt-1.5 text-sm text-ink-soft">Sign in to track milestones, feedback and originality reviews.</p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Email address</label>
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@pulse.edu" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Password</label>
              <input className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="••••••••" />
            </div>
            <Notice error={error} />
            <Btn type="submit" disabled={busy}>
              {busy ? (
                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Signing in…</>
              ) : 'Sign in'}
            </Btn>
          </form>

          {/* Demo accounts */}
          <div className="mt-8 rounded-xl border border-paper-rule bg-paper p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-3">Demo Accounts</p>
            <p className="text-xs text-ink-faint mb-3">Password: <code className="rounded bg-paper-rule px-1.5 py-0.5 font-mono text-ink-soft">password123</code></p>
            <div className="grid gap-1.5">
              {DEMO.map((d) => (
                <button key={d.email} onClick={() => setEmail(d.email)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all
                    ${email === d.email
                      ? 'bg-pulse-tint border border-pulse/30 text-pulse-dark font-medium shadow-sm'
                      : 'hover:bg-paper-hover text-ink-soft hover:text-ink border border-transparent'}`}>
                  <span className="text-base">{d.icon}</span>
                  <div>
                    <p className="font-medium">{d.label}</p>
                    <p className="text-xs text-ink-faint">{d.email}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
