'use client';

import { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { 
  TrendingUp, Users, MousePointer2, ShoppingCart, 
  ArrowUpRight, ArrowDownRight, Activity, Calendar,
  MessageSquare, Layout, Eye, Clock, UserCheck,
  Globe, Share2, Target, BarChart3
} from 'lucide-react';

import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4'];

export default function AnalyticsPage() {
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/analytics/dashboard?days=${days}`)
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  const formatDuration = (ms: number) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds % 60}s`;
  };

  const totalPageViews = data?.pageViews?.reduce((acc: number, curr: any) => acc + curr.views, 0) || 0;
  const totalCartAdds = data?.cartStats?.reduce((acc: number, curr: any) => acc + curr.adds, 0) || 0;

  if (loading && !data) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Harvesting Intelligence...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-12 pb-20 animate-[fadeRise_600ms_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-none">Liquidity Intelligence</h1>
          <p className="text-sm font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">Global Performance & Acquisition Metrics</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div 
            className="flex items-center gap-1 p-1.5 rounded-2xl border shadow-sm"
            style={{ backgroundColor: colors.bg, borderColor: colors.border }}
          >
            {[7, 30, 90].map(d => (
              <button 
                key={d}
                onClick={() => setDays(d)}
                className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                  days === d 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                {d === 7 ? '1W' : d === 30 ? '1M' : 'QUART'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Core Vitals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Consolidated Views" value={totalPageViews.toLocaleString()} change="+14.2%" positive={true} icon={<Eye className="w-5 h-5" />} colors={colors} />
        <StatCard title="Unique Visitors" value={data?.uniqueVisitors?.toLocaleString() || 0} change="+8.4%" positive={true} icon={<UserCheck className="w-5 h-5" />} colors={colors} />
        <StatCard title="Acquisition Volume" value={totalCartAdds.toLocaleString()} change="Jewel Items" positive={true} icon={<ShoppingCart className="w-5 h-5" />} colors={colors} />
        <StatCard title="Avg. Focus Time" value={formatDuration(data?.avgSessionTime)} change="+2.1%" positive={true} icon={<Clock className="w-5 h-5" />} colors={colors} />
      </div>

      {/* Trajectory Layer: Time Series Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Traffic Velocity */}
        <div className="p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">Traffic Velocity</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Daily Engagement Trajectory</p>
            </div>
            <BarChart3 className="w-6 h-6 text-slate-200" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.pageViews || []}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={colors.border} />
                <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} dy={15} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '24px', 
                    border: '1px solid #f1f5f9',
                    backgroundColor: 'rgba(255, 255, 255, 0.96)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)',
                    padding: '20px',
                    color: '#1e293b'
                  }}
                  itemStyle={{ color: '#3b82f6', fontWeight: 800 }} 
                  labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase' }}
                />
                <Area type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={4} fill="url(#colorViews)" animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cart Velocity */}
        <div className="p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">Cart Velocity</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Add-to-Cart Temporal Volume</p>
            </div>
            <Target className="w-6 h-6 text-slate-200" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.cartOverTime || []}>
                <defs>
                  <linearGradient id="colorAdds" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={colors.border} />
                <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} dy={15} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '24px', 
                    border: '1px solid #f1f5f9',
                    backgroundColor: 'rgba(255, 255, 255, 0.96)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)',
                    padding: '20px',
                    color: '#1e293b'
                  }}
                  itemStyle={{ color: '#8b5cf6', fontWeight: 800 }} 
                  labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase' }}
                />
                <Area type="monotone" dataKey="adds" stroke="#8b5cf6" strokeWidth={4} fill="url(#colorAdds)" animationDuration={1800} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Discovery Layer: Geography & Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Geographic Manifest */}
        <div className="p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50 flex flex-col items-center" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="w-full flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-900">Geo Manifest</h3>
            <Globe className="w-6 h-6 text-slate-200" />
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.geoStats || []} dataKey="count" nameKey="_id" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} animationDuration={2000}>
                  {(data?.geoStats || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 w-full space-y-3">
             {data?.geoStats?.slice(0, 4).map((item: any, i: number) => {
               const totalGeo = data.geoStats.reduce((sum: number, curr: any) => sum + curr.count, 0);
               return (
                 <div key={i} className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                     <span className="text-[11px] font-black text-slate-600 truncate max-w-[120px]">{item._id || 'Unknown Region'}</span>
                   </div>
                   <span className="text-[11px] font-bold text-slate-400">{(item.count / totalGeo * 100).toFixed(1)}%</span>
                 </div>
               );
             })}
          </div>
        </div>

        {/* Source Origins */}
        <div className="lg:col-span-2 p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">Source Origins</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Acquisition Channel Attribution</p>
            </div>
            <Share2 className="w-6 h-6 text-slate-200" />
          </div>
          <div className="space-y-6 flex-1">
             {(data?.sourceStats || []).slice(0, 5).map((item: any, i: number) => (
               <div key={i} className="group">
                 <div className="flex items-center justify-between mb-2">
                   <span className="text-[13px] font-black text-slate-700 truncate max-w-[400px]">{item._id === 'direct' ? 'Direct Exploration' : item._id}</span>
                   <span className="text-[11px] font-black text-slate-400">{item.count} sessions</span>
                 </div>
                 <div className="w-full h-2.5 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${(item.count / data.sourceStats[0].count) * 100}%` }}></div>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Performance Layer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* Chat Velocity */}
         <div className="p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">Chat Velocity</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">AI Concierge Interaction Velocity</p>
            </div>
            <MessageSquare className="w-6 h-6 text-slate-200" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chatbotVelocity || []}>
                <defs>
                  <linearGradient id="colorChat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={colors.border} />
                <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} dy={15} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '24px', 
                    border: '1px solid #f1f5f9',
                    backgroundColor: 'rgba(255, 255, 255, 0.96)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)',
                    padding: '20px',
                    color: '#1e293b'
                  }}
                  itemStyle={{ color: '#34d399', fontWeight: 800 }} 
                  labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase' }}
                />
                <Area type="monotone" dataKey="interactions" stroke="#10b981" strokeWidth={4} fill="url(#colorChat)" animationDuration={2000} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Page Performance Table */}
        <div className="p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-900 leading-none">Artisan Page Performance</h3>
            <Layout className="w-6 h-6 text-slate-200" />
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-12 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50">
              <div className="col-span-8">Asset Path</div><div className="col-span-4 text-right">Discovery Velocity</div>
            </div>
            {(data?.pagePerformance || []).map((path: any, i: number) => (
              <div key={i} className="grid grid-cols-12 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 px-2 -mx-2 rounded-2xl transition-colors group">
                <div className="col-span-8 font-bold text-slate-600 text-sm group-hover:text-blue-600 transition-colors truncate">{path._id || '/'}</div>
                <div className="col-span-4 text-right font-black text-slate-900 text-sm">{path.views.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Acquisition Intent */}
        <div className="p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-900 leading-none">Acquisition Intent</h3>
            <Target className="w-6 h-6 text-slate-200" />
          </div>
          <div className="space-y-4">
            {(data?.cartStats || []).map((product: any, i: number) => (
              <div key={i} className="flex items-center gap-6 p-4 rounded-[1.5rem] border border-slate-50 hover:border-blue-100 hover:bg-blue-50/20 transition-all group">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black text-slate-900 shadow-sm">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{product._id || 'Signature Asset'}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">High Interest Shard</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-slate-900">{product.adds.toLocaleString()}</p>
                  <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest">Adds</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, change, positive, icon, colors }: any) {
  return (
    <div className="p-8 rounded-[3rem] border shadow-2xl shadow-slate-200/50 transition-all hover:translate-y-[-4px] group" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      <div className="flex items-start justify-between mb-6">
        <div className="p-4 rounded-[1.5rem] bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all duration-500 shadow-sm">
          {icon}
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-tight ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          {change}
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2 text-slate-400">{title}</p>
      <p className="text-3xl font-black tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
