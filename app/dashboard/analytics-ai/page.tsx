'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  analyticsChat, listAnalyticsSessions, getAnalyticsSession, deleteAnalyticsSession,
  staticUrl, type AnalyticsSession, type ChartConfig, type ChartDataPoint,
} from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  ts?: string;
  charts?: ChartConfig[];
}

// ── Markdown renderer (simple) ────────────────────────────────────────────────

function Markdown({ text }: { text: string }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-blue-50 text-blue-800 px-1 rounded text-[13px] font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-black text-slate-800 text-sm mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-black text-slate-900 mt-4 mb-1">$1</h2>')
    .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n/g, '<br/>');

  return (
    <div
      className="prose prose-sm max-w-none text-[14px] leading-relaxed text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Chart components ─────────────────────────────────────────────────────────

const CHART_COLORS = ['#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#059669','#9333ea'];

function fmtVal(v: number, prefix?: string) {
  if (!prefix) return v.toLocaleString('en-IN');
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000)   return `₹${(v / 100_000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function BarChart({ cfg }: { cfg: ChartConfig }) {
  const max = Math.max(...cfg.data.map(d => d.value), 1);
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">{cfg.title}</p>
      <div className="space-y-2.5">
        {cfg.data.map((d, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-medium text-slate-700 truncate max-w-[55%]">{d.label}</span>
              <span className="text-[12px] font-black text-slate-900">{fmtVal(d.value2 ?? d.value, d.value2 ? '₹' : undefined)}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ cfg }: { cfg: ChartConfig }) {
  const vals = cfg.data.map(d => d.value);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const W = 320; const H = 100; const PAD = 8;
  const points = cfg.data.map((d, i) => ({
    x: PAD + (i / Math.max(cfg.data.length - 1, 1)) * (W - PAD * 2),
    y: H - PAD - ((d.value - min) / range) * (H - PAD * 2),
    d,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L${points[points.length-1].x},${H} L${points[0].x},${H} Z`;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">{cfg.title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }}>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lg)" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#2563eb" />
            {i % Math.max(1, Math.floor(points.length / 6)) === 0 && (
              <text x={p.x} y={H - 1} textAnchor="middle" fontSize="7" fill="#94a3b8">{p.d.label}</text>
            )}
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{fmtVal(min, '₹')}</span>
        <span>{fmtVal(max, '₹')}</span>
      </div>
    </div>
  );
}

function DonutChart({ cfg }: { cfg: ChartConfig }) {
  const total = cfg.data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 36; const CX = 50; const CY = 50;
  let angle = -Math.PI / 2;
  const slices = cfg.data.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    angle += sweep;
    const x2 = CX + R * Math.cos(angle);
    const y2 = CY + R * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return { path: `M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`, color: d.color ?? CHART_COLORS[i % CHART_COLORS.length], d };
  });

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">{cfg.title}</p>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
          {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity={0.9} />)}
          <circle cx={CX} cy={CY} r={R * 0.55} fill="white" />
          <text x={CX} y={CY + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1e293b">{total}</text>
        </svg>
        <div className="space-y-1.5 flex-1 min-w-0">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-[12px] text-slate-600 truncate flex-1">{s.d.label}</span>
              <span className="text-[12px] font-black text-slate-900 flex-shrink-0">
                {s.d.value} <span className="font-normal text-slate-400">({Math.round(s.d.value / total * 100)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCards({ cfg }: { cfg: ChartConfig }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {cfg.data.map((d, i) => (
        <div key={i} className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm text-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{d.label}</p>
          <p className="text-lg font-black text-slate-900 leading-none">{fmtVal(d.value, d.prefix)}</p>
        </div>
      ))}
    </div>
  );
}

function ProfileCard({ cfg }: { cfg: ChartConfig }) {
  const d = cfg.data[0];
  if (!d) return null;
  const m = (d as any).meta ?? {};
  const avatarUrl = m.avatar_url ? staticUrl(m.avatar_url) : null;
  const roleColor: Record<string, string> = {
    cashier: 'text-blue-600 bg-blue-50', manager: 'text-violet-600 bg-violet-50',
    admin: 'text-slate-600 bg-slate-100', custom: 'text-amber-600 bg-amber-50',
  };
  const rc = roleColor[m.role] ?? 'text-slate-600 bg-slate-100';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 pt-5 pb-4 border-b border-slate-100">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 flex items-center justify-center border border-slate-200">
          {avatarUrl
            ? <img src={avatarUrl} alt={d.label} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : <span className="text-slate-600 font-black text-xl">{d.label.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-[15px] leading-tight">{d.label}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${rc}`}>
              {m.role}
            </span>
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${m.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${m.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
              {m.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="px-5 py-4 space-y-2.5">
        {m.branch && (
          <div className="flex items-center gap-3">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth={2} className="flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[12px] text-slate-500 font-medium w-16 flex-shrink-0">Branch</span>
            <span className="text-[12px] font-semibold text-slate-800">{m.branch}{m.branch_city && m.branch_city !== m.branch ? `, ${m.branch_city}` : ''}</span>
          </div>
        )}
        {m.email && (
          <div className="flex items-center gap-3">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth={2} className="flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-[12px] text-slate-500 font-medium w-16 flex-shrink-0">Email</span>
            <span className="text-[12px] font-semibold text-slate-800 truncate">{m.email}</span>
          </div>
        )}
        {m.joining_date && (
          <div className="flex items-center gap-3">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth={2} className="flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[12px] text-slate-500 font-medium w-16 flex-shrink-0">Joined</span>
            <span className="text-[12px] font-semibold text-slate-800">{m.joining_date}</span>
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-3 border-t border-slate-100">
        {[
          { label: 'Total Sales', value: String(m.total_sales ?? 0) },
          { label: 'Revenue', value: fmtVal(m.total_revenue ?? 0, '₹') },
          { label: 'Attendance', value: `${m.attendance_rate ?? 0}%`, sub: `${m.present_days ?? 0}/${(m.present_days ?? 0) + (m.absent_days ?? 0)} days` },
        ].map((s, i) => (
          <div key={i} className={`px-4 py-3 text-center ${i < 2 ? 'border-r border-slate-100' : ''}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{s.label}</p>
            <p className="text-sm font-black text-slate-900">{s.value}</p>
            {s.sub && <p className="text-[9px] text-slate-400 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Charts({ charts }: { charts: ChartConfig[] }) {
  if (!charts || charts.length === 0) return null;
  return (
    <div className="mt-3 space-y-3">
      {charts.map((cfg, i) => {
        if (cfg.data.length === 0) return null;
        if (cfg.type === 'bar')     return <BarChart     key={i} cfg={cfg} />;
        if (cfg.type === 'line')    return <LineChart    key={i} cfg={cfg} />;
        if (cfg.type === 'donut')   return <DonutChart   key={i} cfg={cfg} />;
        if (cfg.type === 'stat')    return <StatCards    key={i} cfg={cfg} />;
        if (cfg.type === 'profile') return <ProfileCard  key={i} cfg={cfg} />;
        return null;
      })}
    </div>
  );
}

// ── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "How were sales today?",
  "Who are the top 5 cashiers this week?",
  "Which products sold the most this month?",
  "Show me branch performance for the last 7 days",
  "How many new customers joined this month?",
  "What's the old gold buyback summary?",
  "Show me the daily sales trend for 2 weeks",
  "Which payment mode is most popular?",
];

// ── Spinner ───────────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4 items-start`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-black ${
        isUser ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
      }`}>
        {isUser ? 'A' : (
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.611-1.31 2.232l-3.714-1.03M5 14.5l-1.402 1.402c-1 1-.03 2.611 1.31 2.232l3.714-1.03" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className={`rounded-2xl shadow-sm ${
        isUser
          ? 'max-w-[78%] bg-blue-600 text-white rounded-tr-sm px-4 py-3'
          : 'flex-1 min-w-0 max-w-[85%]'
      }`}>
        {isUser ? (
          <p className="text-[14px] leading-relaxed">{msg.content}</p>
        ) : (
          <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3">
            <Markdown text={msg.content} />
          </div>
        )}
        {!isUser && msg.charts && msg.charts.length > 0 && (
          <Charts charts={msg.charts} />
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsAIPage() {
  const [sessions, setSessions]       = useState<AnalyticsSession[]>([]);
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [thinking, setThinking]       = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // Load sessions on mount
  const loadSessions = useCallback(async () => {
    try {
      const s = await listAnalyticsSessions(50);
      setSessions(s);
    } catch { /* silent */ }
    finally { setLoadingSessions(false); }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  // Load a session
  async function openSession(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setMessages([]);
    try {
      const session = await getAnalyticsSession(id);
      const msgs: Message[] = (session.messages ?? []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        ts: m.ts,
      }));
      setMessages(msgs);
    } catch { setMessages([]); }
  }

  // Start a new chat
  function newChat() {
    setActiveId(null);
    setMessages([]);
    inputRef.current?.focus();
  }

  // Delete a session
  async function deleteSession(id: string, e: { stopPropagation: () => void }) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteAnalyticsSession(id);
      setSessions(s => s.filter(x => x._id !== id));
      if (activeId === id) { setActiveId(null); setMessages([]); }
    } finally { setDeletingId(null); }
  }

  async function clearAllSessions() {
    if (!confirm('Delete all chat sessions?')) return;
    setClearingAll(true);
    try {
      await Promise.all(sessions.map(s => deleteAnalyticsSession(s._id).catch(() => {})));
      setSessions([]);
      setActiveId(null);
      setMessages([]);
    } finally { setClearingAll(false); }
  }

  // Send a message
  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || thinking) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setThinking(true);

    try {
      const res = await analyticsChat(msg, activeId ?? undefined);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer, charts: res.charts ?? [] }]);

      if (!activeId) {
        setActiveId(res.session_id);
        // Prepend new session to sidebar
        setSessions(prev => [
          { _id: res.session_id, title: res.title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ...prev.filter(s => s._id !== res.session_id),
        ]);
      } else {
        // Update title if first message in session
        setSessions(prev => prev.map(s => s._id === res.session_id ? { ...s, updated_at: new Date().toISOString() } : s));
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  const isEmpty = messages.length === 0 && !thinking;

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={`flex flex-col flex-shrink-0 bg-white border-r border-slate-100 transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-black text-slate-900">Chat History</h2>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{sessions.length} conversation{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {sessions.length > 0 && (
              <button onClick={clearAllSessions} disabled={clearingAll}
                title="Clear all sessions"
                className="p-1.5 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40">
                {clearingAll
                  ? <div className="w-3.5 h-3.5 border border-red-300 border-t-red-500 rounded-full animate-spin" />
                  : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                }
              </button>
            )}
            <button onClick={newChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black transition-colors">
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loadingSessions ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8 px-4">No conversations yet. Ask your first question!</p>
          ) : (
            sessions.map(s => (
              <div key={s._id} onClick={() => openSession(s._id)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors group relative cursor-pointer ${activeId === s._id ? 'bg-blue-50 border-r-2 border-blue-600' : ''}`}>
                <div className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5 ${activeId === s._id ? 'bg-blue-100' : 'bg-slate-100'}`}>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={activeId === s._id ? '#2563eb' : '#94a3b8'} strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-bold truncate leading-snug ${activeId === s._id ? 'text-blue-700' : 'text-slate-700'}`}>{s.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(s.updated_at)}</p>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); deleteSession(s._id, e as any); }}
                  onKeyDown={e => e.key === 'Enter' && deleteSession(s._id, e as any)}
                  aria-disabled={deletingId === s._id}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all flex-shrink-0"
                >
                  {deletingId === s._id
                    ? <div className="w-3 h-3 border border-red-300 border-t-red-500 rounded-full animate-spin" />
                    : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                  }
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0">
          <button onClick={() => setSidebarOpen(o => !o)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.611-1.31 2.232l-3.714-1.03M5 14.5l-1.402 1.402c-1 1-.03 2.611 1.31 2.232l3.714-1.03" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-900 leading-none">RKM AI Insights</h1>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Ask anything about your business — sales, staff, branches, inventory</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-blue-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-200">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.611-1.31 2.232l-3.714-1.03M5 14.5l-1.402 1.402c-1 1-.03 2.611 1.31 2.232l3.714-1.03" />
                </svg>
              </div>
              <h2 className="text-xl font-black text-slate-900 mb-2">Your Business Intelligence AI</h2>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                Ask anything about RKM Jewellers — sales performance, top staff, branch analytics, customer trends, inventory status, and more.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[12px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-all text-wrap">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => <Bubble key={i} msg={m} />)}
              {thinking && (
                <div className="flex gap-3 items-start mb-4">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 flex-shrink-0 flex items-center justify-center">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.611-1.31 2.232l-3.714-1.03M5 14.5l-1.402 1.402c-1 1-.03 2.611 1.31 2.232l3.714-1.03" />
                    </svg>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm shadow-sm">
                    <ThinkingDots />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-6 py-4 bg-white border-t border-slate-100">
          {/* Quick suggestions (shown only when there are messages) */}
          {messages.length > 0 && !thinking && (
            <div className="flex gap-2 flex-wrap mb-3">
              {SUGGESTIONS.slice(0, 4).map(s => (
                <button key={s} onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all whitespace-nowrap">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                rows={1}
                placeholder="Ask about sales, staff performance, branches, inventory…"
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKey}
                disabled={thinking}
                className="w-full resize-none border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 disabled:opacity-50 transition-all"
                style={{ minHeight: '48px' }}
              />
            </div>
            <button
              onClick={() => send()}
              disabled={!input.trim() || thinking}
              className="w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center transition-colors flex-shrink-0 shadow-sm shadow-blue-200"
            >
              {thinking
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
              }
            </button>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
            Powered by Gemini · Live MongoDB data · Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
