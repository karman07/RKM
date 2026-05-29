'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronDown, ChevronUp, Eye, EyeOff, Code2, Palette,
  Plus, Trash2, GripVertical, Star, Wand2, Check, X,
  Type, AlignLeft, Table2, MousePointerClick,
  Receipt, RotateCcw, Bookmark, MessageSquare, FileText,
} from 'lucide-react';
import type { EmailTemplate } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateConfig {
  accent_color: string;
  brand_name: string;
  header_title: string;
  header_subtitle: string;
  body_text: string;
  show_details: boolean;
  detail_rows: DetailRow[];
  show_button: boolean;
  button_text: string;
  footer_text: string;
}

interface DetailRow { id: string; label: string; value: string; highlight: boolean }

interface EditorProps {
  template?: Partial<EmailTemplate>;
  isNew: boolean;
  saving: boolean;
  onSave: (data: Partial<EmailTemplate>) => Promise<void>;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  { hex: '#1f63d8', name: 'Blue' },
  { hex: '#4f46e5', name: 'Indigo' },
  { hex: '#7c3aed', name: 'Purple' },
  { hex: '#db2777', name: 'Pink' },
  { hex: '#dc2626', name: 'Red' },
  { hex: '#ea580c', name: 'Orange' },
  { hex: '#059669', name: 'Green' },
  { hex: '#0891b2', name: 'Teal' },
  { hex: '#5A0F1A', name: 'Maroon' },
  { hex: '#1f2937', name: 'Slate' },
];

const VARIABLES = [
  { key: '{{customer_name}}',  label: 'Customer Name' },
  { key: '{{sale_reference}}', label: 'Order Ref' },
  { key: '{{amount}}',         label: 'Amount' },
  { key: '{{item_name}}',      label: 'Item Name' },
  { key: '{{item_code}}',      label: 'Item Code' },
  { key: '{{branch_name}}',    label: 'Branch' },
  { key: '{{payment_mode}}',   label: 'Payment' },
];

const TYPE_LABELS: Record<string, string> = {
  sale_completed: 'Purchase Confirmation',
  sale_returned:  'Return Acknowledgement',
  sale_reserved:  'Reservation Notice',
  feedback:       'Feedback Request',
  custom:         'Custom',
};

// ─── Preset templates ─────────────────────────────────────────────────────────

interface Preset { label: string; icon: React.ElementType; subject: string; description: string; config: TemplateConfig }

const PRESETS: Record<string, Preset> = {
  sale_completed: {
    label: 'Purchase Confirmation', icon: Receipt, subject: 'Your purchase at RKM Jewels — {{sale_reference}}',
    description: 'Sent automatically when a sale is completed',
    config: {
      accent_color: '#1f63d8', brand_name: 'RKM Jewels',
      header_title: 'Purchase Confirmed',
      header_subtitle: 'Dear {{customer_name}}, thank you for shopping with us.',
      body_text: 'Your jewellery is ready for collection or will be dispatched as per your preference. Here are your order details:',
      show_details: true,
      detail_rows: [
        { id: '1', label: 'Order Reference', value: '{{sale_reference}}', highlight: false },
        { id: '2', label: 'Item',            value: '{{item_name}}',      highlight: false },
        { id: '3', label: 'Item Code',       value: '{{item_code}}',      highlight: false },
        { id: '4', label: 'Branch',          value: '{{branch_name}}',    highlight: false },
        { id: '5', label: 'Payment Mode',    value: '{{payment_mode}}',   highlight: false },
        { id: '6', label: 'Amount Paid',     value: '{{amount}}',         highlight: true  },
      ],
      show_button: false, button_text: '',
      footer_text: 'This is an automated confirmation. Please do not reply to this email.',
    },
  },
  sale_returned: {
    label: 'Return Acknowledgement', icon: RotateCcw, subject: 'Return acknowledged — {{sale_reference}} | RKM Jewels',
    description: 'Sent when a customer return is recorded',
    config: {
      accent_color: '#ea580c', brand_name: 'RKM Jewels',
      header_title: 'Return Acknowledged',
      header_subtitle: 'Hi {{customer_name}}, we have received your return.',
      body_text: "We've received your return request for order {{sale_reference}}. Our team will process your refund shortly and notify you once completed.\n\nIf you have any questions, please contact us directly. Thank you for your patience.",
      show_details: false, detail_rows: [],
      show_button: false, button_text: '',
      footer_text: 'RKM Jewels — Automated Return Confirmation',
    },
  },
  sale_reserved: {
    label: 'Reservation Notice', icon: Bookmark, subject: '{{item_name}} is reserved for you | RKM Jewels',
    description: 'Sent when an item is reserved for a customer',
    config: {
      accent_color: '#7c3aed', brand_name: 'RKM Jewels',
      header_title: 'Item Reserved for You',
      header_subtitle: 'Hi {{customer_name}}, your item is being held.',
      body_text: "Great news! The item you requested has been reserved for you. Please visit your nearest branch within 48 hours to complete the purchase.\n\nPlease note that reservations are held for a limited time only.",
      show_details: true,
      detail_rows: [
        { id: '1', label: 'Item',   value: '{{item_name}}',   highlight: false },
        { id: '2', label: 'Branch', value: '{{branch_name}}', highlight: false },
      ],
      show_button: false, button_text: '',
      footer_text: 'RKM Jewels — Automated Reservation Notice',
    },
  },
  feedback: {
    label: 'Feedback Request', icon: MessageSquare, subject: 'How was your experience? | RKM Jewels',
    description: 'Request feedback from customers after purchase',
    config: {
      accent_color: '#059669', brand_name: 'RKM Jewels',
      header_title: 'How Was Your Experience?',
      header_subtitle: "Hi {{customer_name}}, we'd love to hear from you!",
      body_text: "Thank you for choosing RKM Jewels for your recent purchase ({{sale_reference}}).\n\nYour feedback helps us serve you better. It only takes 30 seconds!",
      show_details: false, detail_rows: [],
      show_button: true, button_text: 'Leave a Review',
      footer_text: 'Thank you for being a valued customer of RKM Jewels.',
    },
  },
  custom: {
    label: 'Blank Template', icon: FileText, subject: 'Message from RKM Jewels',
    description: 'Start from scratch',
    config: {
      accent_color: '#1f63d8', brand_name: 'RKM Jewels',
      header_title: 'Hello {{customer_name}}',
      header_subtitle: '',
      body_text: 'Write your message here.',
      show_details: false, detail_rows: [],
      show_button: false, button_text: '',
      footer_text: 'RKM Jewels',
    },
  },
};

// ─── HTML generator ───────────────────────────────────────────────────────────

function darken(hex: string, amount = 30): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function lighten(hex: string, amount = 220): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function generateEmailHtml(cfg: TemplateConfig): string {
  const c = cfg.accent_color || '#1f63d8';
  const cd = darken(c, 25);
  const cl = lighten(c, 235);

  const detailsHtml = cfg.show_details && cfg.detail_rows.length > 0
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:28px;">
      ${cfg.detail_rows.map((row, i) => {
        const isLast = i === cfg.detail_rows.length - 1;
        if (row.highlight) {
          return `<tr><td style="padding:18px 22px;background:${cl};${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
            <table width="100%"><tr>
              <td style="font-size:14px;color:${c};font-weight:700;">${row.label}</td>
              <td align="right" style="font-size:22px;color:${c};font-weight:900;">${row.value}</td>
            </tr></table></td></tr>`;
        }
        return `<tr><td style="padding:14px 22px;${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
          <table width="100%"><tr>
            <td style="font-size:13px;color:#64748b;font-weight:500;">${row.label}</td>
            <td align="right" style="font-size:13px;color:#0f172a;font-weight:700;">${row.value}</td>
          </tr></table></td></tr>`;
      }).join('')}
    </table>`
    : '';

  const buttonHtml = cfg.show_button && cfg.button_text
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr><td align="center">
          <div style="display:inline-block;background:${c};border-radius:50px;padding:16px 40px;">
            <span style="font-size:14px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${cfg.button_text}</span>
          </div>
        </td></tr>
       </table>`
    : '';

  const bodyLines = (cfg.body_text || '').split('\n').map(l => `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">${l || '&nbsp;'}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${cfg.header_title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,${c} 0%,${cd} 100%);padding:48px 40px 40px;text-align:center;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.55);">${cfg.brand_name || 'RKM JEWELS'}</p>
            <h1 style="margin:0;font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">${cfg.header_title || 'Hello!'}</h1>
            ${cfg.header_subtitle ? `<p style="margin:14px 0 0;font-size:14px;color:rgba(255,255,255,0.8);line-height:1.5;">${cfg.header_subtitle}</p>` : ''}
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px 40px 32px;">
            ${bodyLines}
            ${detailsHtml}
            ${buttonHtml}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #f1f5f9;text-align:center;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#94a3b8;">${cfg.brand_name || 'RKM Jewels'}</p>
            ${cfg.footer_text ? `<p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">${cfg.footer_text}</p>` : ''}
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Accordion section ────────────────────────────────────────────────────────

function Section({ icon, title, children, defaultOpen = true }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
        <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">{icon}</span>
        <span className="text-[13px] font-black text-slate-800 flex-1">{title}</span>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-3 border-t border-slate-50">{children}</div>}
    </div>
  );
}

// ─── Field with variable chips ────────────────────────────────────────────────

function FieldWithVars({ label, fieldRef, value, onChange, multiline = false, hint }: {
  label: string; fieldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string; onChange: (v: string) => void; multiline?: boolean; hint?: string;
}) {
  function insertVar(variable: string) {
    const el = fieldRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + variable + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  const cls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';

  return (
    <div className="mt-3">
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
      {multiline
        ? <textarea ref={fieldRef as React.RefObject<HTMLTextAreaElement>} value={value} onChange={e => onChange(e.target.value)} rows={4} className={`${cls} resize-none`} />
        : <input ref={fieldRef as React.RefObject<HTMLInputElement>} type="text" value={value} onChange={e => onChange(e.target.value)} className={cls} />
      }
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
      <div className="flex flex-wrap gap-1 mt-2">
        {VARIABLES.map(v => (
          <button key={v.key} type="button" onClick={() => insertVar(v.key)}
            className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 hover:border-blue-200 rounded-md text-[10px] font-mono font-bold transition-colors">
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Preset picker modal ──────────────────────────────────────────────────────

function PresetPicker({ onSelect, onClose }: { onSelect: (key: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
          <div>
            <p className="text-base font-black text-slate-900">Start from a template</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Choose a pre-built design and customise it</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Object.entries(PRESETS).map(([key, preset]) => {
            const Icon = preset.icon;
            const color = PRESETS[key].config.accent_color;
            return (
            <button key={key} onClick={() => { onSelect(key); onClose(); }}
              className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50/40 transition-all text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: `${color}18` }}>
                <Icon size={26} style={{ color }} />
              </div>
              <div>
                <p className="text-[12px] font-black text-slate-800 group-hover:text-blue-700 transition-colors">{preset.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{preset.description}</p>
              </div>
            </button>
          ); })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────

export default function EmailTemplateEditor({ template, isNew, saving, onSave, onCancel }: EditorProps) {
  const [mode, setMode] = useState<'visual' | 'html'>(() =>
    template?.template_config ? 'visual' : (isNew ? 'visual' : 'html')
  );
  const [showPreview, setShowPreview] = useState(true);
  const [showPresetPicker, setShowPresetPicker] = useState(isNew);

  // Metadata
  const [name, setName] = useState(template?.name ?? '');
  const [type, setType] = useState<'sale_completed' | 'sale_returned' | 'sale_reserved' | 'feedback' | 'custom'>(template?.type ?? 'sale_completed');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [isActive, setIsActive] = useState(template?.is_active ?? false);

  // Visual config
  const [config, setConfig] = useState<TemplateConfig>(() => {
    if (template?.template_config) return template.template_config as TemplateConfig;
    return PRESETS[template?.type ?? 'sale_completed']?.config ?? PRESETS.custom.config;
  });

  // Raw HTML mode
  const [rawHtml, setRawHtml] = useState(template?.html_body ?? '');

  // Live HTML (derived)
  const [liveHtml, setLiveHtml] = useState('');
  const previewRef = useRef<HTMLIFrameElement>(null);

  // Field refs for cursor-aware variable insertion
  const titleRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Update live HTML when config or mode changes
  useEffect(() => {
    const html = mode === 'visual' ? generateEmailHtml(config) : rawHtml;
    setLiveHtml(html);
  }, [config, rawHtml, mode]);

  // Inject into iframe
  useEffect(() => {
    if (!previewRef.current || !showPreview) return;
    const doc = previewRef.current.contentDocument;
    if (doc) { doc.open(); doc.write(liveHtml || '<p style="padding:32px;font-family:sans-serif;color:#94a3b8;">Preview will appear here</p>'); doc.close(); }
  }, [liveHtml, showPreview]);

  const applyPreset = useCallback((key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setConfig({ ...p.config });
    setType(key === 'custom' ? 'custom' : key as any);
    if (!subject) setSubject(p.subject);
    if (!description) setDescription(p.description);
    if (!name) setName(p.label);
  }, [subject, description, name]);

  function upd(key: keyof TemplateConfig) {
    return (val: any) => setConfig(c => ({ ...c, [key]: val }));
  }

  function addDetailRow() {
    setConfig(c => ({
      ...c,
      detail_rows: [...c.detail_rows, { id: Date.now().toString(), label: 'Label', value: '{{value}}', highlight: false }],
    }));
  }

  function updateRow(id: string, patch: Partial<DetailRow>) {
    setConfig(c => ({ ...c, detail_rows: c.detail_rows.map(r => r.id === id ? { ...r, ...patch } : r) }));
  }

  function removeRow(id: string) {
    setConfig(c => ({ ...c, detail_rows: c.detail_rows.filter(r => r.id !== id) }));
  }

  async function handleSave() {
    const html = mode === 'visual' ? generateEmailHtml(config) : rawHtml;
    const vars = VARIABLES.filter(v => html.includes(v.key)).map(v => v.key);
    await onSave({
      ...template,
      name, type: type as any, subject, description, is_active: isActive,
      html_body: html,
      template_config: mode === 'visual' ? config : null,
      variables: vars,
    });
  }

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';

  return (
    <>
      {showPresetPicker && <PresetPicker onSelect={applyPreset} onClose={() => setShowPresetPicker(false)} />}

      <div className="flex flex-col h-full overflow-hidden bg-slate-50">

        {/* ── Editor header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-slate-100 flex-shrink-0">
          <button onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-200 hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-all flex-shrink-0">
            <ChevronLeft size={16} />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900 truncate">{isNew ? 'New Template' : `Editing: ${name || 'Untitled'}`}</p>
            <p className="text-[10px] text-slate-400">{TYPE_LABELS[type] ?? type}</p>
          </div>

          {/* Preset / start from template */}
          <button onClick={() => setShowPresetPicker(true)}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 text-[11px] font-black uppercase tracking-wider transition-all">
            <Wand2 size={12} /> Templates
          </button>

          {/* Mode toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
            {([['visual', Palette, 'Visual'], ['html', Code2, 'HTML']] as const).map(([m, Icon, label]) => (
              <button key={m} onClick={() => setMode(m as 'visual' | 'html')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${mode === m ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <Icon size={11} /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Preview toggle */}
          <button onClick={() => setShowPreview(p => !p)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all ${showPreview ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-200'}`}>
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
            <span className="hidden sm:inline">Preview</span>
          </button>

          <button onClick={handleSave} disabled={saving || !name || !subject}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 border border-blue-600 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-95">
            {saving ? 'Saving…' : <><Check size={12} /> Save</>}
          </button>
        </div>

        {/* ── Metadata row ──────────────────────────────────────────── */}
        <div className="flex items-end gap-3 px-5 py-3 bg-white border-b border-slate-100 flex-shrink-0 overflow-x-auto">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Template Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Purchase Confirmation v2"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition-all" />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Type</label>
            <select value={type} onChange={e => { setType(e.target.value as any); if (isNew) applyPreset(e.target.value); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all">
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Subject Line *</label>
            <div className="relative">
              <input ref={subjectRef} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-2 pb-0.5 flex-shrink-0">
            <button onClick={() => setIsActive(a => !a)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${isActive ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">{isActive ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        {/* ── Main content ───────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT — settings or HTML editor */}
          <div className={`flex flex-col overflow-y-auto ${showPreview ? 'w-[420px] xl:w-[480px]' : 'flex-1'} flex-shrink-0 bg-slate-50`}>
            {mode === 'visual' ? (
              <div className="p-4 space-y-3">

                {/* 1 — Colors & Branding */}
                <Section icon={<Palette size={14} />} title="Colors & Branding">
                  <div className="mt-3">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Accent Color</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {ACCENT_COLORS.map(ac => (
                        <button key={ac.hex} onClick={() => upd('accent_color')(ac.hex)} title={ac.name}
                          style={{ background: ac.hex }}
                          className={`w-8 h-8 rounded-lg transition-all ${config.accent_color === ac.hex ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'}`}>
                          {config.accent_color === ac.hex && <Check size={14} className="text-white mx-auto" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="color" value={config.accent_color} onChange={e => upd('accent_color')(e.target.value)}
                        className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
                      <input type="text" value={config.accent_color} onChange={e => upd('accent_color')(e.target.value)}
                        className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-400 transition-all" />
                      <span className="text-[10px] text-slate-400">Custom hex</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Brand Name</label>
                    <input value={config.brand_name} onChange={e => upd('brand_name')(e.target.value)} placeholder="RKM Jewels"
                      className={inputCls} />
                  </div>
                </Section>

                {/* 2 — Email Header */}
                <Section icon={<Type size={14} />} title="Email Header">
                  <FieldWithVars label="Headline Title *" fieldRef={titleRef}
                    value={config.header_title} onChange={upd('header_title')}
                    hint="Main heading shown in the coloured banner" />
                  <FieldWithVars label="Subtitle / Greeting" fieldRef={subtitleRef}
                    value={config.header_subtitle} onChange={upd('header_subtitle')} />
                </Section>

                {/* 3 — Message Body */}
                <Section icon={<AlignLeft size={14} />} title="Message Body">
                  <FieldWithVars label="Message Text" fieldRef={bodyRef}
                    value={config.body_text} onChange={upd('body_text')}
                    multiline hint="Use new lines to create paragraphs" />
                </Section>

                {/* 4 — Details Card */}
                <Section icon={<Table2 size={14} />} title="Details Card">
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-bold text-slate-700">Show details table</p>
                      <p className="text-[10px] text-slate-400">A card with order/item information</p>
                    </div>
                    <button onClick={() => upd('show_details')(!config.show_details)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${config.show_details ? 'bg-blue-600' : 'bg-slate-200'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${config.show_details ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {config.show_details && (
                    <div className="mt-3 space-y-2">
                      {config.detail_rows.map((row, i) => (
                        <div key={row.id} className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${row.highlight ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                          <GripVertical size={13} className="text-slate-300 flex-shrink-0" />
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            <input value={row.label} onChange={e => updateRow(row.id, { label: e.target.value })}
                              placeholder="Label" className="w-full px-2 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 transition-all" />
                            <div className="flex gap-1.5">
                              <input value={row.value} onChange={e => updateRow(row.id, { value: e.target.value })}
                                placeholder="Value / {{variable}}" className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 transition-all" />
                              <select onChange={e => { if (e.target.value) updateRow(row.id, { value: row.value + e.target.value }); e.target.value = ''; }}
                                className="px-2 py-1 text-[10px] bg-white border border-slate-200 rounded-lg focus:outline-none text-slate-600">
                                <option value="">+ Var</option>
                                {VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => updateRow(row.id, { highlight: !row.highlight })} title={row.highlight ? 'Remove highlight' : 'Highlight row'}
                              className={`p-1.5 rounded-lg transition-colors ${row.highlight ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 hover:text-blue-600'}`}>
                              <Star size={11} />
                            </button>
                            <button onClick={() => removeRow(row.id)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button onClick={addDetailRow}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-400 hover:text-blue-600 text-[11px] font-bold transition-all">
                        <Plus size={13} /> Add Row
                      </button>
                    </div>
                  )}
                </Section>

                {/* 5 — CTA Button */}
                <Section icon={<MousePointerClick size={14} />} title="Call to Action Button" defaultOpen={false}>
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-bold text-slate-700">Show button</p>
                      <p className="text-[10px] text-slate-400">A clickable button at the bottom</p>
                    </div>
                    <button onClick={() => upd('show_button')(!config.show_button)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${config.show_button ? 'bg-blue-600' : 'bg-slate-200'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${config.show_button ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {config.show_button && (
                    <FieldWithVars label="Button Label" fieldRef={buttonRef}
                      value={config.button_text} onChange={upd('button_text')} />
                  )}
                </Section>

                {/* 6 — Footer */}
                <Section icon={<AlignLeft size={14} />} title="Footer" defaultOpen={false}>
                  <FieldWithVars label="Footer Text" fieldRef={footerRef}
                    value={config.footer_text} onChange={upd('footer_text')}
                    hint="Small print at the bottom of the email" />
                </Section>

              </div>
            ) : (
              /* HTML mode */
              <div className="flex flex-col flex-1 p-4 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-start gap-3">
                  <Code2 size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-black text-blue-800">HTML Mode</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Write raw HTML. Use <code className="bg-blue-100 px-1 rounded">{'{{customer_name}}'}</code> placeholders for dynamic values.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map(v => (
                    <button key={v.key} onClick={() => setRawHtml(h => h + v.key)}
                      className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-mono font-bold transition-colors">
                      {v.key}
                    </button>
                  ))}
                </div>
                <textarea value={rawHtml} onChange={e => setRawHtml(e.target.value)}
                  spellCheck={false}
                  placeholder="<!DOCTYPE html>..."
                  className="flex-1 px-4 py-3 bg-slate-900 text-emerald-400 border border-slate-700 rounded-2xl text-[11px] font-mono focus:outline-none focus:border-blue-400 resize-none min-h-[400px] leading-relaxed" />
              </div>
            )}
          </div>

          {/* RIGHT — Live preview */}
          {showPreview && (
            <div className="flex-1 flex flex-col overflow-hidden border-l border-slate-100 bg-white">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                <Eye size={13} className="text-blue-600" />
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Live Preview</p>
                <span className="text-[10px] text-slate-300 ml-1">— updates as you type</span>
              </div>
              <div className="flex-1 overflow-hidden bg-slate-100">
                <iframe ref={previewRef} className="w-full h-full border-0 scale-[0.92] origin-top" title="email-preview" sandbox="allow-same-origin" />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
