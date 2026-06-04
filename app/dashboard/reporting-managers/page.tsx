'use client';
import {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import {
  getUsers, getWorkers, updateUser, staticUrl,
  type User,
} from '@/lib/api';
import UserHistoryDrawer from '@/components/UserHistoryDrawer';
import {
  Search, X, ZoomIn, ZoomOut, Maximize2, RefreshCw,
  Check, Loader2, AlertTriangle, AlertCircle,
  Building2, ExternalLink, GitBranch, Sparkles, ChevronDown,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AugUser = User & {
  avatar?: string;
  job_title?: string;
  reporting_manager_name?: string;
  reporting_manager_id?: any;
  custom_role?: any;
};

interface OrgNode {
  user: AugUser;
  reportsTo: string;
  reportsToId: string | null;
  children: OrgNode[];
  isOrphan: boolean;
  isCyclic: boolean;
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas constants
// ─────────────────────────────────────────────────────────────────────────────

const NW = 200;
const NH = 96;
const HG = 56;
const VG = 88;
const PAD = 72;

// ─────────────────────────────────────────────────────────────────────────────
// Role styles
// ─────────────────────────────────────────────────────────────────────────────

const ROLE: Record<string, { color: string; soft: string; label: string }> = {
  admin:   { color: '#1f63d8', soft: '#eef5ff', label: 'Admin'   },
  manager: { color: '#7c3aed', soft: '#f5f3ff', label: 'Manager' },
  cashier: { color: '#475569', soft: '#f8fafc', label: 'Cashier' },
  worker:  { color: '#d97706', soft: '#fffbeb', label: 'Worker'  },
  custom:  { color: '#059669', soft: '#f0fdf4', label: 'Custom'  },
};
const roleStyle = (role: string) => ROLE[role] ?? ROLE.custom;

function mkInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function getManagerName(u: AugUser): string {
  if (u.reporting_manager_name) return u.reporting_manager_name;
  const ref = u.reporting_manager_id;
  if (ref && typeof ref === 'object' && ref.name) return ref.name;
  return '';
}

function getManagerId(u: AugUser): string | null {
  const ref = u.reporting_manager_id;
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object' && ref._id) return ref._id;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree builder  — supports both ID-based and name-based lookups
// ─────────────────────────────────────────────────────────────────────────────

function buildOrgTree(
  allUsers: AugUser[],
  localNameMap: Map<string, string>,
  localIdMap: Map<string, string | null>,
): OrgNode[] {
  const idIdx  = new Map<string, AugUser>(allUsers.map(u => [u._id, u]));
  const nameIdx = new Map<string, AugUser>(allUsers.map(u => [u.name.toLowerCase(), u]));

  function resolveParent(u: AugUser): AugUser | null {
    // Check local ID override first
    if (localIdMap.has(u._id)) {
      const mid = localIdMap.get(u._id);
      if (mid) return idIdx.get(mid) ?? null;
    }
    // Check local name override
    if (localNameMap.has(u._id)) {
      const mn = localNameMap.get(u._id)!.trim().toLowerCase();
      return mn ? (nameIdx.get(mn) ?? null) : null;
    }
    // Use stored ID from API
    const mid = getManagerId(u);
    if (mid) return idIdx.get(mid) ?? null;
    // Fall back to stored name
    const mn = getManagerName(u).trim().toLowerCase();
    return mn ? (nameIdx.get(mn) ?? null) : null;
  }

  function getDisplayName(u: AugUser): string {
    if (localNameMap.has(u._id)) return localNameMap.get(u._id)!;
    if (localIdMap.has(u._id)) {
      const mid = localIdMap.get(u._id);
      if (mid) return idIdx.get(mid)?.name ?? '';
      return '';
    }
    // Populated object
    if (u.reporting_manager_name) return u.reporting_manager_name;
    const ref = u.reporting_manager_id;
    if (ref && typeof ref === 'object' && ref.name) return ref.name;
    // Plain string ID — resolve name from index
    if (ref && typeof ref === 'string') return idIdx.get(ref)?.name ?? ref;
    return '';
  }

  // Cycle detection
  const cyclic = new Set<string>();
  function detectCycle(id: string, visited: Set<string>): boolean {
    if (visited.has(id)) { cyclic.add(id); return true; }
    const u = idIdx.get(id);
    if (!u) return false;
    const parent = resolveParent(u);
    if (!parent) return false;
    return detectCycle(parent._id, new Set([...visited, id]));
  }
  for (const u of allUsers) detectCycle(u._id, new Set());

  const nodeMap = new Map<string, OrgNode>();
  for (const u of allUsers) {
    const displayName = getDisplayName(u);
    const parent = resolveParent(u);
    const isOrphan = !!displayName.trim() && !parent;
    nodeMap.set(u._id, {
      user: u,
      reportsTo: displayName,
      reportsToId: parent?._id ?? null,
      children: [],
      isOrphan: !cyclic.has(u._id) && isOrphan,
      isCyclic: cyclic.has(u._id),
      x: 0, y: 0,
    });
  }

  const roots: OrgNode[] = [];
  for (const node of nodeMap.values()) {
    // A node is a root only when it has NO manager reference at all (neither name nor id)
    const hasManager = !!node.reportsTo || !!node.reportsToId;
    if (!hasManager || node.isCyclic) { roots.push(node); continue; }
    const parent = resolveParent(node.user);
    if (parent && nodeMap.has(parent._id)) {
      nodeMap.get(parent._id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function subtreeWidth(n: OrgNode): number {
  if (n.children.length === 0) return NW;
  const total = n.children.reduce((s, c) => s + subtreeWidth(c) + HG, -HG);
  return Math.max(NW, total);
}

function placeNode(n: OrgNode, offsetX: number, depth: number): void {
  n.y = PAD + depth * (NH + VG);
  if (n.children.length === 0) { n.x = offsetX + NW / 2; return; }
  let cx = offsetX;
  for (const child of n.children) {
    placeNode(child, cx, depth + 1);
    cx += subtreeWidth(child) + HG;
  }
  n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
}

function layoutAll(roots: OrgNode[]): { totalW: number; totalH: number } {
  let ox = PAD; let maxH = 0;
  for (const root of roots) {
    placeNode(root, ox, 0);
    ox += subtreeWidth(root) + HG;
    const h = PAD + (maxDepth(root) + 1) * (NH + VG) - VG + PAD;
    if (h > maxH) maxH = h;
  }
  return { totalW: Math.max(ox - HG + PAD, 900), totalH: Math.max(maxH, 500) };
}

function maxDepth(n: OrgNode, d = 0): number {
  if (n.children.length === 0) return d;
  return Math.max(...n.children.map(c => maxDepth(c, d + 1)));
}

function flatNodes(roots: OrgNode[]): OrgNode[] {
  const res: OrgNode[] = [];
  const walk = (n: OrgNode) => { res.push(n); n.children.forEach(walk); };
  roots.forEach(walk);
  return res;
}

function edgeGroups(roots: OrgNode[]): { parent: OrgNode; children: OrgNode[] }[] {
  const res: { parent: OrgNode; children: OrgNode[] }[] = [];
  const walk = (n: OrgNode) => {
    if (n.children.length) res.push({ parent: n, children: n.children });
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node card  — draggable + droppable
// ─────────────────────────────────────────────────────────────────────────────

function NodeCard({
  node, selected, highlighted, onSelect, onDropOnMe,
}: {
  node: OrgNode;
  selected: boolean;
  highlighted: boolean;
  onSelect: (n: OrgNode) => void;
  onDropOnMe: (draggedUserId: string) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const rs = roleStyle(node.user.role);
  const roleLabel = node.user.role === 'worker' && (node.user as any).job_title
    ? (node.user as any).job_title
    : rs.label;
  const branch = node.user.branch && typeof node.user.branch === 'object'
    ? (node.user.branch as any).name as string : null;
  const src = node.user.avatar ? staticUrl(node.user.avatar) : null;

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', node.user._id);
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      }}
      onDragEnd={() => setIsDragOver(false)}
      onDragOver={e => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== node.user._id) {
          onDropOnMe(draggedId);
        }
      }}
      onClick={() => onSelect(node)}
      className="absolute group"
      style={{
        left: node.x - NW / 2,
        top: node.y,
        width: NW,
        height: NH,
        cursor: 'grab',
      }}
    >
      <div
        className={`w-full h-full flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
          isDragOver
            ? 'shadow-2xl scale-105'
            : selected
            ? 'shadow-xl shadow-blue-200'
            : highlighted
            ? 'shadow-lg shadow-amber-100'
            : 'shadow-md shadow-slate-100 hover:shadow-xl hover:shadow-blue-100'
        }`}
        style={{
          borderColor: isDragOver ? '#10b981' : selected ? rs.color : highlighted ? '#f59e0b' : '#e2e8f0',
          backgroundColor: isDragOver ? '#f0fdf4' : selected ? rs.soft : '#fff',
          transform: isDragOver ? 'scale(1.04)' : undefined,
        }}
      >
        {/* Role color bar */}
        <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: isDragOver ? '#10b981' : rs.color }} />

        <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2 flex-1 min-h-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 overflow-hidden border-2 border-white shadow-sm"
            style={{ backgroundColor: rs.color }}
          >
            {src
              ? <img src={src} alt="" className="w-full h-full object-cover" />
              : mkInitials(node.user.name)}
          </div>

          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-[12px] font-black text-slate-900 leading-tight truncate">{node.user.name}</p>
            <p className="text-[9px] font-black uppercase tracking-widest mt-0.5 truncate" style={{ color: rs.color }}>
              {roleLabel}
            </p>
            {branch && (
              <div className="flex items-center gap-1 mt-1">
                <Building2 className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                <span className="text-[9px] text-slate-400 font-semibold truncate">{branch}</span>
              </div>
            )}
          </div>
        </div>

        {isDragOver && (
          <div className="px-3 pb-2 flex items-center gap-1">
            <span className="text-[8px] text-emerald-600 font-bold">Drop to set as manager</span>
          </div>
        )}

        {!isDragOver && (node.isCyclic || node.isOrphan) && (
          <div className="px-3 pb-2 flex items-center gap-1">
            {node.isCyclic
              ? <><AlertCircle className="w-3 h-3 text-red-500" /><span className="text-[8px] text-red-500 font-bold">Circular reference</span></>
              : <><AlertTriangle className="w-3 h-3 text-amber-500" /><span className="text-[8px] text-amber-600 font-bold">"{node.reportsTo}" not found</span></>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Edge lines
// ─────────────────────────────────────────────────────────────────────────────

function EdgeLines({ groups }: { groups: { parent: OrgNode; children: OrgNode[] }[] }) {
  return (
    <>
      {groups.map(({ parent, children }) => {
        const px = parent.x;
        const py = parent.y + NH;
        const jY = parent.y + NH + VG / 2;
        const leftX  = children.reduce((m, c) => Math.min(m, c.x), Infinity);
        const rightX = children.reduce((m, c) => Math.max(m, c.x), -Infinity);
        return (
          <g key={parent.user._id}>
            <line x1={px} y1={py} x2={px} y2={jY} stroke="#cbd5e1" strokeWidth={1.5} />
            {children.length > 1 && (
              <line x1={leftX} y1={jY} x2={rightX} y2={jY} stroke="#cbd5e1" strokeWidth={1.5} />
            )}
            {children.map(child => (
              <line
                key={child.user._id}
                x1={child.x} y1={jY} x2={child.x} y2={child.y}
                stroke={child.isCyclic ? '#fca5a5' : child.isOrphan ? '#fcd34d' : '#cbd5e1'}
                strokeWidth={1.5}
                strokeDasharray={child.isCyclic ? '5,4' : undefined}
              />
            ))}
          </g>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manager Dropdown — searchable combobox
// ─────────────────────────────────────────────────────────────────────────────

function ManagerDropdown({
  value, managerId, allUsers, selfId, disabled,
  onChange,
}: {
  value: string;
  managerId: string | null;
  allUsers: AugUser[];
  selfId: string;
  disabled?: boolean;
  onChange: (name: string, id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers
      .filter(u => u._id !== selfId && (!q || u.name.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [query, allUsers, selfId]);

  const selected = managerId ? allUsers.find(u => u._id === managerId) : null;

  function pickUser(u: AugUser) {
    setQuery(u.name);
    setOpen(false);
    onChange(u.name, u._id);
  }

  function handleInput(v: string) {
    setQuery(v);
    setOpen(true);
    // If the typed value exactly matches a user, set their ID; otherwise clear ID
    const exact = allUsers.find(u => u._id !== selfId && u.name.toLowerCase() === v.trim().toLowerCase());
    if (exact) {
      onChange(exact.name, exact._id);
    } else {
      onChange(v, null);
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Selected pill or input */}
      <div className="relative flex items-center">
        <input
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-slate-800 bg-white focus:outline-none transition-all pr-10"
          style={{ borderColor: open ? '#1f63d8' : '#e2e8f0' }}
          value={query}
          placeholder="Search or type manager name…"
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && filtered.length === 1) pickUser(filtered[0]);
          }}
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          onClick={() => setOpen(o => !o)}
          disabled={disabled}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Clear button when a user is selected */}
      {(query || managerId) && !disabled && (
        <button
          type="button"
          className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
          onClick={() => { setQuery(''); setOpen(false); onChange('', null); }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[11px] text-slate-400 font-semibold">No users found</div>
          ) : (
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
              {filtered.map(u => {
                const rs = roleStyle(u.role);
                const isSelected = u._id === managerId;
                return (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => pickUser(u)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: rs.color }}
                    >
                      {u.avatar
                        ? <img src={staticUrl(u.avatar)} alt="" className="w-full h-full object-cover" />
                        : mkInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{u.name}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: rs.color }}>
                        {rs.label}
                      </p>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ID badge */}
      {managerId && (
        <p className="mt-1 text-[9px] text-slate-400 font-mono truncate">ID: {managerId}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right-side edit panel
// ─────────────────────────────────────────────────────────────────────────────

function EditPanel({
  node, saving, saved, allUsers,
  onChange, onViewHistory, onClose,
}: {
  node: OrgNode;
  saving: boolean;
  saved: boolean;
  allUsers: AugUser[];
  onChange: (userId: string, name: string, managerId: string | null) => void;
  onViewHistory: () => void;
  onClose: () => void;
}) {
  const rs = roleStyle(node.user.role);
  const src = node.user.avatar ? staticUrl(node.user.avatar) : null;
  const branch = node.user.branch && typeof node.user.branch === 'object'
    ? (node.user.branch as any).name : null;
  const roleLabel = node.user.role === 'worker' && (node.user as any).job_title
    ? (node.user as any).job_title : rs.label;

  const [localName, setLocalName] = useState(node.reportsTo);
  const [localId,   setLocalId]   = useState<string | null>(node.reportsToId);
  const [dirty,     setDirty]     = useState(false);

  useEffect(() => {
    setLocalName(node.reportsTo);
    setLocalId(node.reportsToId);
    setDirty(false);
  }, [node.user._id, node.reportsTo, node.reportsToId]);

  function handleDropdownChange(name: string, id: string | null) {
    setLocalName(name);
    setLocalId(id);
    const changed = name !== node.reportsTo || id !== node.reportsToId;
    setDirty(changed);
  }

  function save() {
    onChange(node.user._id, localName.trim(), localId);
    setDirty(false);
  }

  return (
    <div className="w-72 flex-shrink-0 flex flex-col bg-white border-l border-slate-200 shadow-xl animate-[slideRight_220ms_ease-out] overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Employee Details</p>
        <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Profile */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="relative mb-4">
          <div className="h-16 rounded-2xl" style={{ backgroundColor: rs.soft }} />
          <div
            className="absolute -bottom-5 left-4 w-14 h-14 rounded-2xl border-4 border-white flex items-center justify-center text-white text-lg font-black overflow-hidden shadow-md"
            style={{ backgroundColor: rs.color }}
          >
            {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : mkInitials(node.user.name)}
          </div>
        </div>
        <div className="pt-6">
          <h2 className="text-base font-black text-slate-900 leading-tight">{node.user.name}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border"
              style={{ color: rs.color, backgroundColor: rs.soft, borderColor: rs.color + '30' }}
            >
              {roleLabel}
            </span>
            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
              node.user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              {node.user.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            {node.user.email && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-14 flex-shrink-0">Email</span>
                <span className="text-slate-700 font-semibold truncate">{node.user.email}</span>
              </div>
            )}
            {branch && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-14 flex-shrink-0">Branch</span>
                <span className="text-slate-700 font-semibold">{branch}</span>
              </div>
            )}
            {(node.user as any).employee_id && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-14 flex-shrink-0">Emp ID</span>
                <span className="font-black text-[#1f63d8]">{(node.user as any).employee_id}</span>
              </div>
            )}
            {(node.user as any).joining_date && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-14 flex-shrink-0">Joined</span>
                <span className="text-slate-700 font-semibold">{(node.user as any).joining_date}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reports To editor */}
      <div className="px-5 py-5 border-b border-slate-100 flex-shrink-0">
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
          Reports To
        </label>

        <ManagerDropdown
          value={localName}
          managerId={localId}
          allUsers={allUsers}
          selfId={node.user._id}
          disabled={saving}
          onChange={handleDropdownChange}
        />

        <div className="mt-3 flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
          {!saving && saved && !dirty && <Check className="w-3.5 h-3.5 text-emerald-500" />}
          {dirty && !saving && (
            <button
              onClick={save}
              className="flex items-center gap-1 px-3 py-1.5 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#1f63d8' }}
            >
              <Check className="w-3 h-3" />Save
            </button>
          )}
          {dirty && !saving && (
            <button
              onClick={() => { setLocalName(node.reportsTo); setLocalId(node.reportsToId); setDirty(false); }}
              className="px-3 py-1.5 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
          )}
        </div>

        <p className="mt-2 text-[9px] text-slate-400 font-medium leading-relaxed flex items-start gap-1">
          <Sparkles className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-[#1f63d8]" />
          Select from dropdown or type any name. You can also drag a card onto another to assign.
        </p>

        {(node.isOrphan || node.isCyclic) && (
          <div className={`mt-2 flex items-start gap-1.5 p-2.5 rounded-xl ${node.isCyclic ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
            {node.isCyclic
              ? <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
              : <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />}
            <p className="text-[9px] font-semibold leading-snug" style={{ color: node.isCyclic ? '#dc2626' : '#92400e' }}>
              {node.isCyclic ? 'Circular reference detected — this creates a reporting loop.' : `"${node.reportsTo}" doesn't match any employee.`}
            </p>
          </div>
        )}
      </div>

      {/* Direct reports */}
      {node.children.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Direct Reports ({node.children.length})
          </p>
          <div className="space-y-1.5">
            {node.children.slice(0, 5).map(child => {
              const cs = roleStyle(child.user.role);
              return (
                <div key={child.user._id} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[8px] font-black flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: cs.color }}>
                    {child.user.avatar
                      ? <img src={staticUrl(child.user.avatar)} alt="" className="w-full h-full object-cover" />
                      : mkInitials(child.user.name)}
                  </div>
                  <span className="text-xs font-bold text-slate-700 truncate flex-1">{child.user.name}</span>
                  <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: cs.color }}>{cs.label}</span>
                </div>
              );
            })}
            {node.children.length > 5 && (
              <p className="text-[9px] text-slate-400 font-semibold">+ {node.children.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {node.user.role !== 'worker' && (
        <div className="px-5 py-4 flex-shrink-0 mt-auto">
          <button
            onClick={onViewHistory}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-[11px] font-black uppercase tracking-widest transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: '#1f63d8' }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Full Profile
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation warnings bar
// ─────────────────────────────────────────────────────────────────────────────

function ValidationBar({ roots }: { roots: OrgNode[] }) {
  const warnings = useMemo(() => {
    const out: { type: 'orphan' | 'cyclic'; name: string; ref: string }[] = [];
    const walk = (n: OrgNode) => {
      if (n.isCyclic) out.push({ type: 'cyclic', name: n.user.name, ref: n.reportsTo });
      else if (n.isOrphan) out.push({ type: 'orphan', name: n.user.name, ref: n.reportsTo });
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return out;
  }, [roots]);

  if (warnings.length === 0) return null;
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-100">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">
        {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
      </span>
      {warnings.slice(0, 3).map((w, i) => (
        <span key={i} className={`text-[9px] font-semibold px-2 py-0.5 rounded-lg border ${
          w.type === 'cyclic' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-100 border-amber-200 text-amber-800'
        }`}>
          {w.type === 'cyclic' ? `${w.name}: circular` : `${w.name} → "${w.ref}" not found`}
        </span>
      ))}
      {warnings.length > 3 && <span className="text-[9px] text-amber-600 font-bold">+{warnings.length - 3} more</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-12">
      <div className="w-24 h-24 rounded-3xl bg-[#eef5ff] border border-[#cfe0ff] flex items-center justify-center mb-6">
        <GitBranch className="w-12 h-12 text-[#1f63d8]" />
      </div>
      <h3 className="text-xl font-black text-slate-800 mb-2">No Hierarchy Yet</h3>
      <p className="text-sm text-slate-400 font-medium max-w-sm leading-relaxed">
        Click any employee node and select a manager from the dropdown, or <b>drag</b> a card onto another to set the reporting relationship.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportingManagersPage() {
  const [allUsers, setAllUsers]     = useState<AugUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [localNameMap, setLocalNameMap] = useState<Map<string, string>>(new Map());
  const [localIdMap,   setLocalIdMap]   = useState<Map<string, string | null>>(new Map());
  const [savingSet, setSavingSet]   = useState<Set<string>>(new Set());
  const [savedSet, setSavedSet]     = useState<Set<string>>(new Set());

  const [search, setSearch]               = useState('');
  const [selectedNode, setSelectedNode]   = useState<OrgNode | null>(null);
  const [showHistory, setShowHistory]     = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null);
  const [scale, setScale]                 = useState(0.82);
  const [pan, setPan]                     = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    setLoading(true);
    try {
      const [allR, workerR] = await Promise.all([
        getUsers(undefined, 1, 1000),
        getWorkers(undefined, 1, 500),
      ]);
      setAllUsers([...(allR.data as AugUser[]), ...(workerR.data as AugUser[])]);
    } catch (e: any) {
      showToast(e.message || 'Failed to load', false);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // ── Save handler ──────────────────────────────────────────────────────────

  async function handleChange(userId: string, name: string, managerId: string | null) {
    setLocalNameMap(prev => new Map(prev).set(userId, name));
    setLocalIdMap(prev => new Map(prev).set(userId, managerId));
    setSavingSet(prev => new Set(prev).add(userId));

    if (selectedNode?.user._id === userId) {
      setSelectedNode(prev => prev ? { ...prev, reportsTo: name, reportsToId: managerId } : prev);
    }
    try {
      await updateUser(userId, {
        reporting_manager_id:   managerId || null,
        reporting_manager_name: managerId ? null : (name || null),
      });
      setSavedSet(prev => { const s = new Set(prev); s.add(userId); return s; });
      setTimeout(() => setSavedSet(prev => { const s = new Set(prev); s.delete(userId); return s; }), 2000);
      setAllUsers(prev => prev.map(u =>
        u._id === userId
          ? {
              ...u,
              // Always store the resolved ID so getManagerId() works after reload
              reporting_manager_id: managerId ?? null,
              // Store name only when we have no ID (custom string manager)
              reporting_manager_name: managerId ? undefined : (name || undefined),
            }
          : u
      ));
      showToast(`Manager updated for ${allUsers.find(u => u._id === userId)?.name ?? 'user'}`);
    } catch (e: any) {
      showToast(e.message || 'Save failed', false);
    } finally {
      setSavingSet(prev => { const s = new Set(prev); s.delete(userId); return s; });
    }
  }

  // Drag-drop handler: dragged user now reports to target user
  function handleDrop(draggedUserId: string, targetNode: OrgNode) {
    if (draggedUserId === targetNode.user._id) return;
    // handleChange already shows a toast on success; don't double-toast
    handleChange(draggedUserId, targetNode.user.name, targetNode.user._id);
  }

  // ── Build tree ────────────────────────────────────────────────────────────

  const orgRoots = useMemo(
    () => buildOrgTree(allUsers, localNameMap, localIdMap),
    [allUsers, localNameMap, localIdMap],
  );

  const { nodes, groups, canvasW, canvasH } = useMemo(() => {
    if (orgRoots.length === 0) return { nodes: [], groups: [], canvasW: 900, canvasH: 500 };
    const { totalW, totalH } = layoutAll(orgRoots);
    return { nodes: flatNodes(orgRoots), groups: edgeGroups(orgRoots), canvasW: totalW, canvasH: totalH };
  }, [orgRoots]);

  const highlightedIds = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const q = search.toLowerCase();
    return new Set(nodes.filter(n =>
      n.user.name.toLowerCase().includes(q) || n.user.email?.toLowerCase().includes(q)
    ).map(n => n.user._id));
  }, [nodes, search]);

  // ── Pan handlers ──────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    isPanning.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(() => { isPanning.current = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.min(2, Math.max(0.3, s - e.deltaY * 0.001)));
  }, []);

  const total    = allUsers.length;
  const assigned = allUsers.filter(u =>
    getManagerName(u) ||        // populated name or name from populated id object
    getManagerId(u) ||          // plain string id saved on server
    localNameMap.get(u._id) ||  // locally changed this session (name)
    localIdMap.get(u._id)       // locally changed this session (id)
  ).length;

  return (
    <div className="flex flex-col h-full min-h-0 -m-8">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[200] px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3 duration-300 ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
          {toast.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm font-bold">{toast.msg}</span>
        </div>
      )}

      {showHistory && selectedNode && (
        <UserHistoryDrawer
          user={selectedNode.user as User}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center gap-4 px-8 py-4 border-b border-slate-100 bg-white flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 bg-[#1f63d8] rounded-full" />
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none">Org Chart</h1>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Reporting Structure</p>
          </div>
        </div>

        <div className="flex gap-1.5 ml-2">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-xl bg-white">
            <span className="text-sm font-black text-slate-800">{total}</span>
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">People</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border rounded-xl bg-white" style={{ borderColor: '#1f63d8' }}>
            <span className="text-sm font-black" style={{ color: '#1f63d8' }}>{assigned}</span>
            <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#1f63d8' }}>Assigned</span>
          </div>
          {total - assigned > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 border border-amber-300 rounded-xl bg-white">
              <span className="text-sm font-black text-amber-600">{total - assigned}</span>
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-400">Unset</span>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            className="w-52 pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all"
            onFocus={e => { e.target.style.borderColor = '#1f63d8'; e.target.style.background = '#fff'; }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
            placeholder="Find employee…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
          <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-slate-800 transition-all">
            <ZoomIn className="w-3.5 h-3.5 rotate-180" />
          </button>
          <span className="text-[10px] font-black text-slate-500 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-slate-800 transition-all">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setScale(0.82); setPan({ x: 0, y: 0 }); }}
            className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-slate-800 transition-all"
            title="Reset view"
          ><Maximize2 className="w-3.5 h-3.5" /></button>
        </div>

        <button
          onClick={load}
          className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:text-[#1f63d8] hover:border-[#1f63d8] transition-all"
        ><RefreshCw className="w-4 h-4" /></button>
      </div>

      <ValidationBar roots={orgRoots} />

      {/* Main area */}
      <div className="flex flex-1 min-h-0">

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 min-w-0 overflow-hidden relative"
          style={{
            background: 'radial-gradient(circle, #f1f5f9 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            cursor: isPanning.current ? 'grabbing' : 'grab',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[#eef5ff] border border-[#cfe0ff] flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-[#1f63d8] animate-spin" />
                </div>
                <p className="text-sm font-bold text-slate-400">Building org chart…</p>
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <EmptyChart />
          ) : (
            <div
              className="absolute"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: 'top center',
                width: canvasW,
                height: canvasH,
              }}
            >
              <svg className="absolute inset-0 pointer-events-none" width={canvasW} height={canvasH}>
                <EdgeLines groups={groups} />
              </svg>

              {nodes.map(node => (
                <div key={node.user._id} data-node="1">
                  <NodeCard
                    node={node}
                    selected={selectedNode?.user._id === node.user._id}
                    highlighted={highlightedIds.has(node.user._id)}
                    onSelect={n => { setSelectedNode(n); setShowHistory(false); }}
                    onDropOnMe={draggedUserId => handleDrop(draggedUserId, node)}
                  />
                </div>
              ))}
            </div>
          )}

          {search && highlightedIds.size > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#1f63d8] text-white rounded-full text-xs font-black shadow-lg">
              {highlightedIds.size} match{highlightedIds.size !== 1 ? 'es' : ''} for "{search}"
            </div>
          )}
          {search && highlightedIds.size === 0 && !loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-800 text-white rounded-full text-xs font-black shadow-lg">
              No matches for "{search}"
            </div>
          )}

          {!loading && nodes.length > 0 && (
            <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[9px] text-slate-400 font-semibold">
              <span>Scroll to zoom · drag canvas to pan · drag card onto another to assign manager · click card to edit</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        {selectedNode && !showHistory && (
          <EditPanel
            node={selectedNode}
            saving={savingSet.has(selectedNode.user._id)}
            saved={savedSet.has(selectedNode.user._id)}
            allUsers={allUsers}
            onChange={handleChange}
            onViewHistory={() => setShowHistory(true)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
