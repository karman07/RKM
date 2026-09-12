'use client';

import {
  useState, useEffect, useRef, useCallback, type DragEvent,
} from 'react';
import {
  Layout, Plus, Trash2, Send, CheckCircle2, XCircle, Clock, AlertCircle,
  RefreshCw, Eye, Zap, Edit3, ChevronDown, Smartphone, MoreVertical,
  Image, Video, FileText, MapPin, Phone, Link2, Copy, RotateCcw,
  Info, Bold, Italic, CornerDownLeft, ArrowRight, Star,
} from 'lucide-react';
import {
  waListTemplatesV2, waCreateTemplateV2, waDeleteTemplate,
  waSyncTemplate, waSyncAllTemplates, waSubmitTemplate, waTemplateStats,
  type WaTemplateV2, type WaTemplateComponentV2, type WaTemplateButton,
} from '@/lib/api';

// ─── Customer schema variables ────────────────────────────────────────────────

const CUSTOMER_VARS = [
  { key: 'name',              label: 'Full Name',          sample: 'Gurpreet Singh',      group: 'Customer' },
  { key: 'phone',             label: 'Phone Number',       sample: '+91 98765 43210',     group: 'Customer' },
  { key: 'email',             label: 'Email Address',      sample: 'g.singh@gmail.com',   group: 'Customer' },
  { key: 'city',              label: 'City',               sample: 'Chandigarh',          group: 'Customer' },
  { key: 'state',             label: 'State',              sample: 'Punjab',              group: 'Customer' },
  { key: 'country',           label: 'Country',            sample: 'India',               group: 'Customer' },
  { key: 'saleReference',     label: 'Sale Reference',     sample: 'SALE-2026-0042',      group: 'Sale' },
  { key: 'itemName',          label: 'Item Name',          sample: '22K Gold Necklace',   group: 'Sale' },
  { key: 'itemCode',          label: 'Item Code',          sample: 'GLD-NK-0042',         group: 'Sale' },
  { key: 'amount',            label: 'Sale Amount',        sample: '₹1,25,000',           group: 'Sale' },
  { key: 'branchName',        label: 'Branch Name',        sample: 'Chandigarh Main',     group: 'Sale' },
  { key: 'lastContactedAt',   label: 'Last Contacted',     sample: '15 Apr 2026',         group: 'Customer' },
  { key: 'shopName',          label: 'Shop Name',          sample: 'RKM Jewellers',       group: 'Business' },
  { key: 'returnDeadline',    label: 'Return Deadline',    sample: '22 Apr 2026',         group: 'Sale' },
] as const;

type VarKey = (typeof CUSTOMER_VARS)[number]['key'];

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  APPROVED:  { label: 'Approved',  color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', icon: CheckCircle2 },
  PENDING:   { label: 'Pending',   color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: Clock },
  REJECTED:  { label: 'Rejected',  color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: XCircle },
  DISABLED:  { label: 'Disabled',  color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', icon: AlertCircle },
  PAUSED:    { label: 'Paused',    color: '#263a5e', bg: '#f2f4fa', border: '#a0afd2', icon: AlertCircle },
  IN_APPEAL: { label: 'In Appeal', color: '#263a5e', bg: '#f2f4fa', border: '#a0afd2', icon: Zap },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Spinner() {
  return <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />;
}

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`app-toast ${type === 'success' ? 'app-toast-success' : 'app-toast-danger'}`}>
      {type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      <span>{msg}</span>
      <button className="app-toast-close" onClick={onClose}><XCircle size={16} /></button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.PENDING;
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border"
      style={{ color: m.color, background: m.bg, borderColor: m.border }}>
      <Icon size={10} /> {m.label}
    </span>
  );
}

/** Insert text at current cursor position in a textarea ref */
function insertAtCursor(ref: React.RefObject<HTMLTextAreaElement | null>, text: string) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  const before = el.value.slice(0, start);
  const after  = el.value.slice(end);
  const newVal = before + text + after;
  el.value = newVal;
  el.setSelectionRange(start + text.length, start + text.length);
  el.focus();
  // Trigger React synthetic onChange
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  nativeInputValueSetter?.call(el, newVal);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// Count max variable index in a string
function maxVarIndex(text: string): number {
  const matches = text?.match(/\{\{\d+\}\}/g) ?? [];
  if (!matches.length) return 0;
  return Math.max(...matches.map(m => parseInt(m.replace(/[{}]/g, ''))));
}

// ─── Phone Preview ─────────────────────────────────────────────────────────

function PhonePreview({
  components, varMapping, samples,
}: {
  components: WaTemplateComponentV2[];
  varMapping: Record<string, string>;
  samples: string[];
}) {
  const header  = components.find(c => c.type === 'HEADER');
  const body    = components.find(c => c.type === 'BODY');
  const footer  = components.find(c => c.type === 'FOOTER');
  const buttons = components.find(c => c.type === 'BUTTONS');

  function renderText(text = '') {
    let result = text;
    samples.forEach((s, i) => {
      result = result.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), s || `[${varMapping[String(i + 1)] ?? `var ${i + 1}`}]`);
    });
    // WhatsApp formatting
    result = result.replace(/\*(.+?)\*/g, '<strong>$1</strong>');
    result = result.replace(/_(.+?)_/g,   '<em>$1</em>');
    result = result.replace(/~(.+?)~/g,   '<del>$1</del>');
    return result;
  }

  const headerBg: Record<string, string> = {
    IMAGE: '#c7d0e7', VIDEO: '#e3e8f4', DOCUMENT: '#fef3c7', LOCATION: '#d1fae5',
  };

  return (
    <div className="flex flex-col items-center select-none">
      {/* Phone chrome */}
      <div className="w-[260px] bg-white rounded-[2rem] shadow-2xl border-4 border-slate-800 overflow-hidden">
        {/* Notch */}
        <div className="bg-slate-800 flex justify-center py-1.5">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>

        {/* WhatsApp header bar */}
        <div className="bg-[#128C7E] text-white px-3 py-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <Smartphone size={12} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black leading-none">Business</p>
            <p className="text-[7px] text-white/60">online</p>
          </div>
          <MoreVertical size={12} className="text-white/60" />
        </div>

        {/* Chat area */}
        <div className="bg-[#ECE5DD] p-2.5 min-h-[240px] max-h-[380px] overflow-y-auto">
          {/* Message bubble */}
          <div className="bg-white rounded-xl rounded-tl-sm shadow-sm overflow-hidden max-w-[220px] ml-auto">
            {/* Header block */}
            {header && (
              <>
                {header.format === 'TEXT' && header.text && (
                  <div className="px-3 pt-3 pb-1">
                    <p className="text-[12px] font-black text-slate-800 leading-snug"
                      dangerouslySetInnerHTML={{ __html: renderText(header.text) }} />
                  </div>
                )}
                {(header.format === 'IMAGE' || header.format === 'VIDEO' || header.format === 'DOCUMENT' || header.format === 'LOCATION') && (
                  <div className="relative" style={{ background: headerBg[header.format] ?? '#f1f5f9' }}>
                    {header.format === 'IMAGE' && header.mediaUrl ? (
                      <img src={header.mediaUrl} alt="Header" className="w-full h-28 object-cover" onError={e => { (e.target as any).style.display='none'; }} />
                    ) : (
                      <div className="h-24 flex flex-col items-center justify-center gap-1">
                        {header.format === 'IMAGE'    && <Image size={24} className="text-blue-400" />}
                        {header.format === 'VIDEO'    && <Video size={24} className="text-blue-400" />}
                        {header.format === 'DOCUMENT' && <FileText size={24} className="text-amber-400" />}
                        {header.format === 'LOCATION' && <MapPin size={24} className="text-green-400" />}
                        <p className="text-[8px] font-bold text-slate-400">
                          {header.format === 'IMAGE'    && (header.mediaUrl ? 'Loading…' : 'Image placeholder')}
                          {header.format === 'VIDEO'    && 'Video placeholder'}
                          {header.format === 'DOCUMENT' && (header.filename || 'Document')}
                          {header.format === 'LOCATION' && 'Location'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Body */}
            {body?.text && (
              <div className={`px-3 ${header ? 'pt-2' : 'pt-3'} pb-2`}>
                <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: renderText(body.text) }} />
              </div>
            )}

            {/* Footer */}
            {footer?.text && (
              <div className="px-3 pb-1">
                <p className="text-[9px] text-slate-400 italic">{footer.text}</p>
              </div>
            )}

            {!header && !body?.text && !footer?.text && (
              <div className="px-3 py-8 text-center">
                <p className="text-[10px] text-slate-300 font-medium">Preview appears here</p>
              </div>
            )}

            {/* Timestamp */}
            <div className="px-3 pb-2 flex justify-end">
              <span className="text-[7px] text-slate-300 font-bold">
                {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ✓✓
              </span>
            </div>

            {/* Buttons */}
            {buttons?.buttons?.map((btn, i) => (
              <div key={i} className="border-t border-slate-100 px-3 py-2 text-center cursor-pointer hover:bg-slate-50">
                <p className="text-[10px] font-black text-[#128C7E] flex items-center justify-center gap-1">
                  {btn.type === 'QUICK_REPLY'    && <CornerDownLeft size={9} />}
                  {btn.type === 'URL'            && <Link2 size={9} />}
                  {btn.type === 'PHONE_NUMBER'   && <Phone size={9} />}
                  {btn.type === 'COPY_CODE'      && <Copy size={9} />}
                  {btn.text || `Button ${i + 1}`}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Input bar */}
        <div className="bg-[#F0F0F0] px-3 py-2 flex items-center gap-2">
          <div className="flex-1 bg-white rounded-full h-7 px-3 flex items-center">
            <p className="text-[8px] text-slate-300">Type a message…</p>
          </div>
          <div className="w-7 h-7 bg-[#128C7E] rounded-full flex items-center justify-center">
            <Smartphone size={10} className="text-white" />
          </div>
        </div>

        {/* Home bar */}
        <div className="bg-slate-800 py-1.5 flex justify-center">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
      </div>
      <p className="text-[9px] text-slate-300 font-black uppercase tracking-widest mt-3">Live Preview</p>
    </div>
  );
}

// ─── Variable chip (draggable) ────────────────────────────────────────────────

function VarChip({
  varEntry, position, onInsert, onDragStart,
}: {
  varEntry: (typeof CUSTOMER_VARS)[number];
  position: number;
  onInsert: (position: number, key: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, position: number, key: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, position, varEntry.key)}
      onClick={() => onInsert(position, varEntry.key)}
      className="group flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg cursor-grab active:cursor-grabbing hover:bg-blue-100 hover:border-blue-300 transition-all"
      title={`Sample: ${varEntry.sample}`}
    >
      <span className="text-[9px] font-black text-blue-500/60 font-mono bg-blue-100 px-1 rounded">{`{{${position}}}`}</span>
      <span className="text-[10px] font-black text-blue-700">{varEntry.label}</span>
      <span className="text-[8px] text-blue-400 hidden group-hover:block max-w-[80px] truncate">{varEntry.sample}</span>
    </div>
  );
}

// ─── Template Builder ─────────────────────────────────────────────────────────

type HeaderFmt = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

const BUTTON_TYPES = [
  { value: 'QUICK_REPLY',  label: 'Quick Reply',  icon: CornerDownLeft },
  { value: 'URL',          label: 'URL Link',     icon: Link2 },
  { value: 'PHONE_NUMBER', label: 'Phone Number', icon: Phone },
  { value: 'COPY_CODE',    label: 'Copy Code',    icon: Copy },
] as const;

const CATEGORIES_LIST = [
  { value: 'MARKETING',      label: 'Marketing',      color: '#263a5e' },
  { value: 'UTILITY',        label: 'Utility',        color: '#4c6291' },
  { value: 'AUTHENTICATION', label: 'Authentication', color: '#263a5e' },
] as const;

const LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en',    label: 'English (UK)' },
  { value: 'hi',    label: 'Hindi' },
  { value: 'pa',    label: 'Punjabi' },
  { value: 'gu',    label: 'Gujarati' },
  { value: 'mr',    label: 'Marathi' },
  { value: 'ta',    label: 'Tamil' },
  { value: 'te',    label: 'Telugu' },
];

function TemplateBuilder({ onSaved }: { onSaved: () => void }) {
  // Basic info
  const [name,        setName]        = useState('');
  const [category,    setCategory]    = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('UTILITY');
  const [language,    setLanguage]    = useState('en_US');

  // Header
  const [headerFmt,   setHeaderFmt]   = useState<HeaderFmt>('NONE');
  const [headerText,  setHeaderText]  = useState('');
  const [mediaUrl,    setMediaUrl]    = useState('');
  const [filename,    setFilename]    = useState('');

  // Body / footer
  const [bodyText,    setBodyText]    = useState('');
  const [footerText,  setFooterText]  = useState('');

  // Buttons
  const [buttons, setButtons] = useState<{ type: string; text: string; url?: string; phone_number?: string; example?: string }[]>([]);

  // Variable mapping: position (1-based string) → customer field key
  const [varMapping,  setVarMapping]  = useState<Record<string, string>>({});

  // Admin notes + submit toggle
  const [notes,       setNotes]       = useState('');
  const [submitMeta,  setSubmitMeta]  = useState(true);

  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Refs for insert-at-cursor
  const bodyRef   = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLTextAreaElement>(null);
  const activeTextareaRef = useRef<React.RefObject<HTMLTextAreaElement | null>>(bodyRef);

  // Drag state
  const dragData = useRef<{ position: number; key: string } | null>(null);

  // Compute highest variable index in body + header
  const bodyVarCount   = maxVarIndex(bodyText);
  const headerVarCount = maxVarIndex(headerText);
  const totalVars      = Math.max(bodyVarCount, headerVarCount);
  const samples        = Array.from({ length: totalVars }, (_, i) => {
    const mappedKey = varMapping[String(i + 1)];
    if (!mappedKey) return `[param ${i + 1}]`;
    return CUSTOMER_VARS.find(v => v.key === mappedKey)?.sample ?? mappedKey;
  });

  // Next available position
  function nextPosition(): number {
    const used = Object.keys(varMapping).map(Number).sort((a, b) => a - b);
    for (let i = 1; i <= used.length + 1; i++) {
      if (!used.includes(i)) return i;
    }
    return used.length + 1;
  }

  function insertVar(position: number, key: string, targetRef: React.RefObject<HTMLTextAreaElement | null>) {
    insertAtCursor(targetRef, `{{${position}}}`);
    setVarMapping(prev => ({ ...prev, [String(position)]: key }));
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, position: number, key: string) {
    dragData.current = { position, key };
    e.dataTransfer.effectAllowed = 'copy';
  }

  function makeDropHandlers(ref: React.RefObject<HTMLTextAreaElement | null>) {
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        if (!dragData.current) return;
        const { position, key } = dragData.current;
        insertVar(position, key, ref);
        dragData.current = null;
      },
    };
  }

  function handleVarChipInsert(position: number, _key: string) {
    // Determine which textarea is focused and insert there
    insertVar(position, _key, activeTextareaRef.current);
  }

  function addButton() {
    if (buttons.length >= 10) return;
    setButtons(prev => [...prev, { type: 'QUICK_REPLY', text: '' }]);
  }

  function buildComponents(): WaTemplateComponentV2[] {
    const out: WaTemplateComponentV2[] = [];

    if (headerFmt !== 'NONE') {
      const comp: WaTemplateComponentV2 = { type: 'HEADER', format: headerFmt };
      if (headerFmt === 'TEXT') { comp.text = headerText; }
      else { comp.mediaUrl = mediaUrl; if (filename) comp.filename = filename; }
      out.push(comp);
    }

    if (bodyText.trim()) out.push({ type: 'BODY', text: bodyText.trim() });
    if (footerText.trim()) out.push({ type: 'FOOTER', text: footerText.trim() });
    if (buttons.length > 0) out.push({ type: 'BUTTONS', buttons: buttons as WaTemplateButton[] });

    return out;
  }

  async function handleSave() {
    if (!name.trim() || !bodyText.trim()) {
      setToast({ msg: 'Template name and body text are required.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await waCreateTemplateV2({
        name: name.trim().toLowerCase().replace(/[\s-]+/g, '_'),
        category,
        language,
        components: buildComponents(),
        adminNotes: notes,
        submitToMeta: submitMeta,
        variableMapping: varMapping,
        sampleBodyValues: samples,
      });
      setToast({ msg: submitMeta ? '✓ Template submitted to Meta for review' : '✓ Draft saved successfully', type: 'success' });
      // Reset
      setName(''); setHeaderFmt('NONE'); setHeaderText(''); setMediaUrl('');
      setFilename(''); setBodyText(''); setFooterText(''); setButtons([]);
      setVarMapping({}); setNotes('');
      onSaved();
    } catch (e: any) {
      setToast({ msg: e.message || 'Failed to save template', type: 'error' });
    } finally { setSaving(false); }
  }

  // Group customer vars by group
  const varGroups = Array.from(new Set(CUSTOMER_VARS.map(v => v.group)));

  return (
    <div className="grid xl:grid-cols-[1fr_1fr_280px] gap-6">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Left: Form ── */}
      <div className="xl:col-span-1 space-y-5">
        {/* Identity */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Template Identity</p>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="sale_confirmation"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
              <p className="text-[9px] text-slate-300 mt-1 font-medium">Lowercase, underscores only — must match Meta exactly</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Category *</label>
                <div className="space-y-1.5">
                  {CATEGORIES_LIST.map(c => (
                    <button key={c.value} onClick={() => setCategory(c.value as any)}
                      className={`w-full px-3 py-2 rounded-xl border text-left text-[11px] font-black transition-all ${category === c.value ? 'shadow-sm' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                      style={category === c.value ? { background: `${c.color}12`, color: c.color, borderColor: `${c.color}40` } : {}}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Header <span className="text-slate-300 font-medium normal-case">(optional)</span></p>

          {/* Header type selector */}
          <div className="flex gap-2 flex-wrap mb-4">
            {[
              { v: 'NONE',     label: 'None',     icon: null },
              { v: 'TEXT',     label: 'Text',     icon: Bold },
              { v: 'IMAGE',    label: 'Image',    icon: Image },
              { v: 'VIDEO',    label: 'Video',    icon: Video },
              { v: 'DOCUMENT', label: 'Document', icon: FileText },
            ].map(({ v, label, icon: Icon }) => (
              <button key={v} onClick={() => setHeaderFmt(v as HeaderFmt)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black transition-all ${headerFmt === v ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'}`}>
                {Icon && <Icon size={11} />} {label}
              </button>
            ))}
          </div>

          {headerFmt === 'TEXT' && (
            <div {...makeDropHandlers(headerRef)}>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Header Text <span className="text-slate-300 font-medium">(bold, max 60 chars, {'{{'+'1'+'}}'} allowed)</span></label>
              <textarea
                ref={headerRef}
                value={headerText}
                onChange={e => setHeaderText(e.target.value)}
                onFocus={() => { activeTextareaRef.current = headerRef; }}
                placeholder="Your Sale Confirmation"
                rows={2}
                maxLength={60}
                className="w-full px-4 py-2.5 border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none font-semibold"
              />
              <p className="text-[9px] text-slate-300 text-right mt-0.5 font-medium">{headerText.length}/60 · Drag variables here ↑</p>
            </div>
          )}

          {(headerFmt === 'IMAGE' || headerFmt === 'VIDEO' || headerFmt === 'DOCUMENT') && (
            <div className="space-y-3">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  {headerFmt === 'IMAGE' ? 'Image URL (HTTPS)' : headerFmt === 'VIDEO' ? 'Video URL (HTTPS)' : 'Document URL (HTTPS)'}
                </label>
                <input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                  placeholder={headerFmt === 'IMAGE' ? 'https://yourdomain.com/image.jpg' : headerFmt === 'VIDEO' ? 'https://yourdomain.com/video.mp4' : 'https://yourdomain.com/file.pdf'}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                <p className="text-[9px] text-slate-300 mt-1 font-medium">Publicly accessible URL — Meta fetches this during template review</p>
              </div>
              {headerFmt === 'DOCUMENT' && (
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Document Filename</label>
                  <input value={filename} onChange={e => setFilename(e.target.value)} placeholder="receipt.pdf"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Body *</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-slate-300 font-bold">*bold* _italic_ ~strike~</span>
            </div>
          </div>
          <div {...makeDropHandlers(bodyRef)}>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Body Text <span className="text-slate-300 font-medium">(use {'{'}{'{'} 1 {'}'}{'}'}  for variables · drag/click from panel)</span>
            </label>
            <textarea
              ref={bodyRef}
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              onFocus={() => { activeTextareaRef.current = bodyRef; }}
              rows={6}
              maxLength={1024}
              placeholder={`Hello {{1}}, your *sale {{2}}* has been confirmed.\n\nAmount: ₹{{3}}\nItem: {{4}}\n\nThank you for choosing _RKM Jewellers_! 🙏`}
              className="w-full px-4 py-3 border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[9px] text-blue-500 font-bold">← Drag variables here · or click chips in panel</p>
              <p className="text-[9px] text-slate-300 font-medium">{bodyText.length}/1024</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Footer <span className="text-slate-300 font-medium normal-case">(optional · small gray text · no variables)</span></p>
          <input value={footerText} onChange={e => setFooterText(e.target.value)}
            placeholder="RKM Jewellers · quality you can trust"
            maxLength={60}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
          <p className="text-[9px] text-slate-300 mt-0.5 font-medium text-right">{footerText.length}/60</p>
        </div>

        {/* Buttons */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buttons <span className="text-slate-300 font-medium normal-case">(max 10)</span></p>
              <p className="text-[9px] text-slate-300 font-medium mt-0.5">Quick Reply, URL, Phone, Copy Code</p>
            </div>
            {buttons.length < 10 && (
              <button onClick={addButton}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black hover:bg-blue-100 transition-colors border border-blue-100">
                <Plus size={11} /> Add Button
              </button>
            )}
          </div>

          {buttons.length === 0 && (
            <p className="text-center text-slate-300 py-4 text-[11px] font-medium">No buttons — click Add Button to start</p>
          )}

          <div className="space-y-3">
            {buttons.map((btn, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <select value={btn.type}
                    onChange={e => setButtons(prev => { const n = [...prev]; n[i] = { ...n[i], type: e.target.value }; return n; })}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 bg-white focus:ring-2 focus:ring-blue-500/20 outline-none">
                    {BUTTON_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
                  </select>
                  <input value={btn.text}
                    onChange={e => setButtons(prev => { const n = [...prev]; n[i] = { ...n[i], text: e.target.value }; return n; })}
                    placeholder="Button label"
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] bg-white focus:ring-2 focus:ring-blue-500/20 outline-none" />
                  <button onClick={() => setButtons(prev => prev.filter((_, j) => j !== i))}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>

                {btn.type === 'URL' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={btn.url ?? ''} onChange={e => setButtons(prev => { const n = [...prev]; n[i] = { ...n[i], url: e.target.value }; return n; })}
                      placeholder="https://rkm.in/{{1}}"
                      className="col-span-2 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-mono bg-white focus:ring-2 focus:ring-blue-500/20 outline-none" />
                    <p className="col-span-2 text-[9px] text-slate-300 font-medium">Use {'{'}{'{'} 1 {'}'}{'}'}  for a dynamic URL suffix</p>
                  </div>
                )}
                {btn.type === 'PHONE_NUMBER' && (
                  <input value={btn.phone_number ?? ''} onChange={e => setButtons(prev => { const n = [...prev]; n[i] = { ...n[i], phone_number: e.target.value }; return n; })}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-mono bg-white focus:ring-2 focus:ring-blue-500/20 outline-none" />
                )}
                {btn.type === 'COPY_CODE' && (
                  <input value={btn.example ?? ''} onChange={e => setButtons(prev => { const n = [...prev]; n[i] = { ...n[i], example: e.target.value }; return n; })}
                    placeholder="RAKHI25"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-mono bg-white focus:ring-2 focus:ring-blue-500/20 outline-none" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Options & submit */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Submission</p>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Internal Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Campaign context, requested by, expected use-case…"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none" />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`w-12 h-6 rounded-full transition-colors relative ${submitMeta ? 'bg-blue-600' : 'bg-slate-300'}`}
              onClick={() => setSubmitMeta(s => !s)}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${submitMeta ? 'left-6' : 'left-0.5'}`} />
            </div>
            <div>
              <p className="text-sm font-black text-slate-700">Submit to Meta for Approval</p>
              <p className="text-[10px] text-slate-400 font-medium">Disable to save as a local draft</p>
            </div>
          </label>

          <button onClick={handleSave} disabled={!name.trim() || !bodyText.trim() || saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:pointer-events-none">
            {saving ? <><Spinner /><span>Saving…</span></> : <><Send size={16} /><span>{submitMeta ? 'Save & Submit to Meta' : 'Save Draft'}</span></>}
          </button>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-2 items-start">
            <Info size={13} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
              Meta reviews templates in minutes to 24 hours. APPROVED templates unlock automatically in the Send tab. REJECTED templates display Meta's rejection reason.
            </p>
          </div>
        </div>
      </div>

      {/* ── Middle: Variable Mapping Panel ── */}
      <div className="space-y-5">
        {/* Variable mapping */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5 sticky top-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <ArrowRight size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Variable Panel</p>
              <p className="text-[9px] text-slate-400 font-medium">Drag or click to insert into body / header</p>
            </div>
          </div>

          {/* Current mapping */}
          {Object.keys(varMapping).length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-2">Current Mapping</p>
              <div className="space-y-1">
                {Object.entries(varMapping).sort(([a], [b]) => Number(a) - Number(b)).map(([pos, key]) => {
                  const v = CUSTOMER_VARS.find(cv => cv.key === key);
                  return (
                    <div key={pos} className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-black text-blue-500">{'{'}{'{'}{pos}{'}'}{'}'}</span>
                      <ArrowRight size={8} className="text-slate-300" />
                      <span className="text-[9px] font-bold text-slate-600">{v?.label ?? key}</span>
                      <button onClick={() => setVarMapping(prev => { const n = { ...prev }; delete n[pos]; return n; })}
                        className="ml-auto text-slate-300 hover:text-red-400 transition-colors">
                        <XCircle size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Variable chips by group */}
          {varGroups.map(group => (
            <div key={group} className="mb-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-2">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOMER_VARS.filter(v => v.group === group).map(v => {
                  const existingPos = Object.entries(varMapping).find(([, key]) => key === v.key)?.[0];
                  const position    = existingPos ? Number(existingPos) : nextPosition();
                  return (
                    <VarChip
                      key={v.key}
                      varEntry={v}
                      position={position}
                      onInsert={(pos, key) => handleVarChipInsert(pos, key)}
                      onDragStart={handleDragStart}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {totalVars === 0 && (
            <div className="py-4 text-center border-t border-slate-100 mt-3">
              <p className="text-[10px] text-slate-300 font-medium">Type {'{'}{'{'} 1 {'}'}{'}'}  in body to activate variables</p>
            </div>
          )}

          {/* Sample preview */}
          {totalVars > 0 && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl border-t border-slate-100">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Sample Values for Preview</p>
              {Array.from({ length: totalVars }, (_, i) => {
                const key = varMapping[String(i + 1)];
                const v   = CUSTOMER_VARS.find(cv => cv.key === key);
                return (
                  <p key={i} className="text-[9px] font-bold text-slate-500 mb-0.5">
                    <span className="font-mono text-blue-400">{'{'}{'{'}{i + 1}{'}'}{'}'}  </span>
                    → <span className="text-green-600">{v?.sample ?? '[unset]'}</span>
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Phone Preview ── */}
      <div className="sticky top-4 h-fit">
        <PhonePreview
          components={buildComponents()}
          varMapping={varMapping}
          samples={samples}
        />
      </div>
    </div>
  );
}

// ─── Template List ────────────────────────────────────────────────────────────

function TemplateList({ refresh }: { refresh: number }) {
  const [templates, setTemplates] = useState<WaTemplateV2[]>([]);
  const [stats,     setStats]     = useState<{ status: string; count: number }[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [filter,    setFilter]    = useState('');
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [tpl, st] = await Promise.all([waListTemplatesV2(filter || undefined), waTemplateStats()]);
      setTemplates(tpl); setStats(st);
    } catch { /**/ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [refresh, filter]);

  async function handleSync(id: string) {
    setSyncing(id);
    try {
      const updated = await waSyncTemplate(id) as any;
      setTemplates(prev => prev.map(t => t._id === id ? updated : t));
      setToast({ msg: `✓ Synced: ${updated.status}`, type: 'success' });
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
    finally { setSyncing(null); }
  }

  async function handleSyncAll() {
    setSyncing('all');
    try {
      const res = await waSyncAllTemplates();
      setToast({ msg: `✓ Synced ${res.synced} templates`, type: 'success' });
      load();
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
    finally { setSyncing(null); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This also removes it from Meta.`)) return;
    setDeleting(id);
    try {
      await waDeleteTemplate(id);
      setTemplates(prev => prev.filter(t => t._id !== id));
      setToast({ msg: '✓ Template deleted', type: 'success' });
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
    finally { setDeleting(null); }
  }

  async function handleSubmit(id: string) {
    setSyncing(id);
    try {
      const updated = await waSubmitTemplate(id) as any;
      setTemplates(prev => prev.map(t => t._id === id ? updated : t));
      setToast({ msg: '✓ Submitted to Meta', type: 'success' });
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
    finally { setSyncing(null); }
  }

  const total = stats.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-5">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 items-center">
        {[{ label: `All (${total})`, value: '' },
          ...stats.map(s => ({ label: `${s.status} (${s.count})`, value: s.status }))
        ].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${filter === f.value ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:text-blue-600 hover:border-blue-200'}`}>
            {f.label}
          </button>
        ))}
        <button onClick={handleSyncAll} disabled={syncing === 'all'}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all">
          {syncing === 'all' ? <Spinner /> : <RefreshCw size={10} />} Sync All from Meta
        </button>
      </div>

      {loading ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-36 bg-white border border-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="py-20 text-center bg-white border border-slate-100 rounded-2xl">
          <Layout size={36} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-black text-sm">No templates {filter ? `with status ${filter}` : 'yet'}</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map(t => {
            const body   = t.components.find(c => c.type === 'BODY')?.text;
            const header = t.components.find(c => c.type === 'HEADER');
            const btns   = t.components.find(c => c.type === 'BUTTONS');
            const isExpanded = expanded === t._id;
            const varKeys = Object.entries(t.variableMapping ?? {}).sort(([a], [b]) => Number(a) - Number(b));

            return (
              <div key={t._id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-mono font-black text-sm text-slate-800 truncate">{t.name}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-widest">
                        {t.category} · {t.language}
                        {header && ` · ${header.format ?? 'TEXT'} header`}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  {/* Body preview */}
                  {body && (
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 bg-slate-50 rounded-xl px-3 py-2 mb-3">
                      {body}
                    </p>
                  )}

                  {/* Rejection reason */}
                  {t.status === 'REJECTED' && t.rejectionReason && (
                    <div className="p-2.5 bg-red-50 border border-red-100 rounded-xl mb-3">
                      <p className="text-[9px] font-black text-red-600 mb-0.5">Meta Rejection Reason</p>
                      <p className="text-[10px] text-red-500 font-medium">{t.rejectionReason}</p>
                    </div>
                  )}

                  {/* Variable mapping */}
                  {varKeys.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {varKeys.map(([pos, key]) => {
                        const v = CUSTOMER_VARS.find(cv => cv.key === key);
                        return (
                          <span key={pos} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-lg text-[9px] font-bold text-blue-600">
                            <span className="font-mono">{'{'}{'{'}{pos}{'}'}{'}'}  </span> {v?.label ?? key}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Button pills */}
                  {btns?.buttons && btns.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {btns.buttons.map((b, i) => (
                        <span key={i} className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-lg text-[9px] font-black text-emerald-600">
                          {b.type === 'QUICK_REPLY' ? '↩' : b.type === 'URL' ? '🔗' : b.type === 'PHONE_NUMBER' ? '📞' : '📋'} {b.text}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Meta info */}
                  <div className="text-[9px] text-slate-300 font-bold flex flex-wrap gap-2 mb-4">
                    {t.submittedToMeta && <span className="text-blue-400 flex items-center gap-1"><CheckCircle2 size={8} /> Submitted</span>}
                    {t.lastSyncedAt && <span>Synced {new Date(t.lastSyncedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    {t.adminNotes && <span className="italic truncate max-w-[120px]">📝 {t.adminNotes}</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => handleSync(t._id)} disabled={syncing === t._id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black hover:bg-blue-100 transition-colors disabled:opacity-50">
                      <RefreshCw size={9} className={syncing === t._id ? 'animate-spin' : ''} /> Sync
                    </button>
                    {!t.submittedToMeta && (
                      <button onClick={() => handleSubmit(t._id)} disabled={syncing === t._id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-[9px] font-black hover:bg-green-100 transition-colors disabled:opacity-50">
                        <Send size={9} /> Submit
                      </button>
                    )}
                    <button onClick={() => handleDelete(t._id, t.name)} disabled={deleting === t._id}
                      className="flex ml-auto items-center gap-1 px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-[9px] font-black hover:bg-red-100 transition-colors disabled:opacity-50">
                      <Trash2 size={9} /> {deleting === t._id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [refreshKey,  setRefreshKey]  = useState(0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Message Templates</h2>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Create templates with full WhatsApp formatting · submit to Meta · track approval status
          </p>
        </div>
        <button onClick={() => setShowBuilder(s => !s)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-sm ${
            showBuilder ? 'bg-slate-100 text-slate-600 shadow-none hover:bg-slate-200' : 'bg-blue-600 text-white shadow-blue-600/25 hover:bg-blue-700 shadow-lg'
          }`}>
          {showBuilder ? <><ChevronDown size={16} /> Close Builder</> : <><Plus size={16} /> New Template</>}
        </button>
      </div>

      {showBuilder && (
        <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Edit3 size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Template Builder</p>
              <p className="text-[10px] text-slate-400 font-medium">Full WhatsApp spec · drag-and-drop variables · live phone preview</p>
            </div>
          </div>
          <TemplateBuilder onSaved={() => { setShowBuilder(false); setRefreshKey(k => k + 1); }} />
        </div>
      )}

      <TemplateList refresh={refreshKey} />
    </div>
  );
}
