'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { staticUrl, type User, type Branch } from '@/lib/api';
import { downloadElementAsPdf, shareElementAsPdf } from '@/lib/pdf-utils';

interface EmployeeIdCardModalProps {
  user: User;
  branches: Branch[];
  onClose: () => void;
}

/** Fixed destination printed/encoded on every employee ID card */
const PRODUCTS_URL = 'https://rkmjewellers.com/products';

/** Brand accent — matches the maroon used for "Sales" elsewhere in the admin */
const MAROON = '#5A0F1A';

function fmtDate(d?: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EmployeeIdCardModal({ user, branches, onClose }: EmployeeIdCardModalProps) {
  const [generatingPdf, setGeneratingPdf] = useState<'download' | 'share' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(PRODUCTS_URL, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, []);

  const isWorker = user.role === 'worker';
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const photo = (user as any).avatar ? staticUrl((user as any).avatar) : '';
  const roleLabel = isWorker && (user as any).job_title ? (user as any).job_title : user.role;
  const branchId = typeof user.branch === 'object' ? user.branch?._id : user.branch;
  const branchName = typeof user.branch === 'object'
    ? user.branch?.name
    : branches.find(b => b._id === branchId)?.name;
  const mobile = (user as any).mobile_number as string | undefined;
  const cardNo = `RKM-${(user.employee_id || user._id.slice(-6)).replace(/[^A-Z0-9]/gi, '')}`;

  const handleDownload = async () => {
    setGeneratingPdf('download');
    try {
      await downloadElementAsPdf('printable-employee-id-card', `${cardNo}.pdf`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handleShare = async () => {
    setGeneratingPdf('share');
    try {
      const shared = await shareElementAsPdf(
        'printable-employee-id-card',
        `${cardNo}.pdf`,
        `Employee ID Card ${cardNo}`,
        `RKM Jewellers employee ID card for ${user.name}`,
      );
      if (!shared) toast.info('Direct sharing isn\'t supported on this browser — the ID card PDF was downloaded instead.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Failed to share ID card');
    } finally {
      setGeneratingPdf(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center bg-black/70 p-2 md:p-4 overflow-y-auto">
      <div className="w-full flex items-center justify-between mb-3 px-1 sticky top-0 z-10 max-w-2xl mx-auto">
        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Employee ID Card Preview</span>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={generatingPdf !== null}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black text-xs font-bold uppercase tracking-widest border border-white hover:bg-gray-100 transition-all shadow-lg disabled:opacity-60"
          >
            {generatingPdf === 'download'
              ? <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>}
            {generatingPdf === 'download' ? 'Generating…' : 'Download PDF'}
          </button>
          <button
            onClick={handleShare}
            disabled={generatingPdf !== null}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 text-white text-xs font-bold uppercase tracking-widest border border-white/30 hover:bg-white/20 transition-all shadow-lg disabled:opacity-60"
          >
            {generatingPdf === 'share'
              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342a3 3 0 100-2.684m0 2.684a3 3 0 100 2.684m0-2.684l6.632 3.316m0-6.316a3 3 0 105.368-2.684 3 3 0 00-5.368 2.684zm0 6.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>}
            {generatingPdf === 'share' ? 'Preparing…' : 'Share'}
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="w-full max-w-2xl flex items-center justify-center py-6">
        <div
          id="printable-employee-id-card"
          style={{ fontFamily: '"Arial", "Helvetica Neue", sans-serif', fontSize: '11px', color: '#000', background: '#fff', border: `2px solid ${MAROON}`, borderRadius: '18px', overflow: 'hidden', width: '360px' }}
        >
          {/* Header strip */}
          <div style={{ textAlign: 'center', background: MAROON, color: '#fff', padding: '16px 20px' }}>
            <div style={{ fontSize: '19px', fontWeight: 900, letterSpacing: '3px', fontFamily: '"Georgia", serif' }}>RKM JEWELLERS</div>
            <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '2px', marginTop: '4px' }}>EMPLOYEE ID CARD</div>
            <div style={{ fontSize: '8px', letterSpacing: '1px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>{cardNo}</div>
          </div>

          {/* Body — everything stacked vertically, centered */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px' }}>
            <div style={{ width: '128px', height: '150px', flexShrink: 0, borderRadius: '10px', border: `2px solid ${MAROON}`, overflow: 'hidden', background: '#f1f1f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {photo
                ? <img src={photo} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '36px', fontWeight: 900, color: '#666' }}>{initials}</span>}
            </div>

            <div style={{ fontSize: '19px', fontWeight: 900, marginTop: '16px', textAlign: 'center', color: '#000' }}>{user.name}</div>
            <div style={{ marginTop: '6px', padding: '3px 14px', background: MAROON, color: '#fff', fontSize: '9px', fontWeight: 900, letterSpacing: '1.5px', borderRadius: '999px', textTransform: 'uppercase' }}>
              {roleLabel}
            </div>

            <div style={{ width: '100%', marginTop: '18px', borderTop: `1px dashed ${MAROON}55`, paddingTop: '14px' }}>
              {[
                { label: 'Employee ID', value: user.employee_id || '—' },
                { label: 'Branch', value: branchName || 'Unassigned' },
                ...(mobile ? [{ label: 'Contact', value: mobile }] : []),
                ...(!isWorker && user.email ? [{ label: 'Email', value: user.email }] : []),
                ...(user.joining_date ? [{ label: 'Joined', value: fmtDate(user.joining_date) }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '5px 0', fontSize: '11px' }}>
                  <span style={{ color: MAROON, fontWeight: 700, textTransform: 'uppercase', fontSize: '8.5px', letterSpacing: '0.5px', paddingTop: '2px' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right', color: '#000' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer with QR — stacked, centered */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: `1.5px solid ${MAROON}`, padding: '18px 20px', background: '#fdf8f8' }}>
            <div style={{ width: '90px', height: '90px', flexShrink: 0, border: `1px solid ${MAROON}55`, borderRadius: '6px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR code" style={{ width: '100%', height: '100%' }} />
                : <div style={{ width: '16px', height: '16px', border: `2px solid ${MAROON}55`, borderTopColor: MAROON, borderRadius: '50%' }} />}
            </div>
            <div style={{ fontSize: '9px', color: '#555', lineHeight: 1.6, textAlign: 'center', marginTop: '10px' }}>
              <div style={{ fontWeight: 900, color: MAROON, fontSize: '10px' }}>SCAN TO EXPLORE OUR COLLECTION</div>
              <div>{PRODUCTS_URL.replace('https://', '')}</div>
              <div style={{ marginTop: '6px', color: '#000' }}>This card is the property of RKM Jewellers.<br />If found, please return to the nearest branch.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
