'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getCustomerById, getMyEnquiries, getCustomerPurchases, getCustomerGoldBalance, getCustomerCustomFields,
  updateCustomer, uploadUserAvatar, generateCertificate, staticUrl, checkSessionExpiry, GST_TREATMENTS,
  getCustomerAdvances, createCustomerAdvance,
  type FullCustomer, type SaleEnquiry, type InventoryItem, type GoldBalance, type EmployeeCustomField, type ContactPerson, type CustomerAdvance,
} from '../../../../lib/api';
import Modal from '../../../../components/Modal';
import AdvanceReceiptModal from '../../../../components/AdvanceReceiptModal';

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

const TYPE_LABEL: Record<string, string> = { item_sale: 'Item Sale', investment: 'Investment' };
const STATUS_CFG: Record<string, { label: string; text: string; dot: string }> = {
  pending:  { label: 'Pending',  text: 'text-amber-600',  dot: 'bg-amber-500'  },
  approved: { label: 'Approved', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', text: 'text-red-500',    dot: 'bg-red-500'    },
};
const PLAN_STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
  halted: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-slate-100 text-slate-500 border-slate-200',
};

function EditCustomerModal({
  open, customer, definedFields, onClose, onSaved,
}: {
  open: boolean; customer: FullCustomer; definedFields: EmployeeCustomField[];
  onClose: () => void; onSaved: (c: FullCustomer) => void;
}) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? '');
  const [city, setCity] = useState(customer.city ?? '');
  const [address, setAddress] = useState(customer.address ?? '');
  const [definedFieldValues, setDefinedFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [customerSubType, setCustomerSubType] = useState<'individual' | 'business'>(customer.customer_sub_type ?? 'individual');
  const [companyName, setCompanyName] = useState(customer.company_name ?? '');
  const [salutation, setSalutation] = useState(customer.salutation ?? '');
  const [firstName, setFirstName] = useState(customer.first_name ?? '');
  const [lastName, setLastName] = useState(customer.last_name ?? '');
  const [workPhone, setWorkPhone] = useState(customer.work_phone ?? '');
  const [website, setWebsite] = useState(customer.website ?? '');
  const [gstTreatment, setGstTreatment] = useState(customer.gst_treatment ?? '');
  const [gstNo, setGstNo] = useState(customer.gst_no ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(customer.place_of_supply ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>(customer.contact_persons ?? []);

  useEffect(() => {
    if (!open) return;
    setName(customer.name);
    setEmail(customer.email ?? '');
    setCity(customer.city ?? '');
    setAddress(customer.address ?? '');
    setCustomerSubType(customer.customer_sub_type ?? 'individual');
    setCompanyName(customer.company_name ?? '');
    setSalutation(customer.salutation ?? '');
    setFirstName(customer.first_name ?? '');
    setLastName(customer.last_name ?? '');
    setWorkPhone(customer.work_phone ?? '');
    setWebsite(customer.website ?? '');
    setGstTreatment(customer.gst_treatment ?? '');
    setGstNo(customer.gst_no ?? '');
    setPlaceOfSupply(customer.place_of_supply ?? '');
    setNotes(customer.notes ?? '');
    setContactPersons(customer.contact_persons ?? []);
    const values: Record<string, string> = {};
    (customer.customFields ?? []).forEach(f => { values[f.key] = f.value; });
    setDefinedFieldValues(values);
    setErr('');
  }, [open, customer]);

  async function handleSave() {
    if (!name.trim()) { setErr('Customer name is required'); return; }
    const missingDefined = definedFields.filter(f => f.required && !definedFieldValues[f.key]?.trim());
    if (missingDefined.length) { setErr(`Missing required field(s): ${missingDefined.map(f => f.label).join(', ')}`); return; }
    setErr(''); setSaving(true);
    try {
      const validDefinedFields = definedFields
        .filter(f => definedFieldValues[f.key]?.trim())
        .map(f => ({ key: f.key, value: definedFieldValues[f.key] }));
      const updated = await updateCustomer(customer._id, {
        name: name.trim(),
        email: email.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        customFields: definedFields.length ? validDefinedFields : undefined,
        customer_sub_type: customerSubType,
        company_name: customerSubType === 'business' ? companyName.trim() || undefined : undefined,
        salutation: salutation || undefined,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        work_phone: workPhone.trim() || undefined,
        website: website.trim() || undefined,
        gst_treatment: (gstTreatment || null) as any,
        gst_no: gstNo.trim() || undefined,
        place_of_supply: placeOfSupply.trim() || undefined,
        notes: notes.trim() || undefined,
        contact_persons: contactPersons.filter(p => p.first_name?.trim()),
      });
      onSaved(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Customer">
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Full Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer full name" autoFocus
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business Details</p>
          <div className="flex gap-2">
            {(['individual', 'business'] as const).map(t => (
              <button key={t} type="button" onClick={() => setCustomerSubType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all ${customerSubType === t ? 'bg-[#5A0F1A] text-white border-[#5A0F1A]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                {t}
              </button>
            ))}
          </div>
          {customerSubType === 'business' && (
            <input placeholder="Company / business name" value={companyName} onChange={e => setCompanyName(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
          )}
          <div className="grid grid-cols-3 gap-2">
            <select value={salutation} onChange={e => setSalutation(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]">
              <option value="">—</option>
              {['Mr.', 'Mrs.', 'Ms.', 'Dr.'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
            <input placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Work phone" value={workPhone} onChange={e => setWorkPhone(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
            <input placeholder="Website" value={website} onChange={e => setWebsite(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Email</label>
            <input type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">City</label>
            <input placeholder="City" value={city} onChange={e => setCity(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Address</label>
          <input placeholder="Full address…" value={address} onChange={e => setAddress(e.target.value)}
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">GST &amp; Tax</p>
          <select value={gstTreatment} onChange={e => setGstTreatment(e.target.value as any)}
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all">
            <option value="">Not specified</option>
            {GST_TREATMENTS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="GSTIN" value={gstNo} onChange={e => setGstNo(e.target.value.toUpperCase())}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
            <input placeholder="Place of supply" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contact Persons</p>
            <button type="button" className="text-[10px] font-black text-[#5A0F1A] hover:underline"
              onClick={() => setContactPersons(p => [...p, { salutation: '', first_name: '', last_name: '', email: '', phone: '', mobile: '', designation: '', department: '', is_primary_contact: p.length === 0 }])}>
              + Add Contact
            </button>
          </div>
          {contactPersons.map((cp, i) => (
            <div key={i} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer">
                  <input type="radio" name="sales-primary-contact" checked={!!cp.is_primary_contact}
                    onChange={() => setContactPersons(list => list.map((p, j) => ({ ...p, is_primary_contact: j === i })))} />
                  Primary
                </label>
                <button type="button" onClick={() => setContactPersons(list => list.filter((_, j) => j !== i))}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="First name" value={cp.first_name}
                  onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, first_name: e.target.value } : p))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
                <input placeholder="Last name" value={cp.last_name}
                  onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, last_name: e.target.value } : p))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
                <input placeholder="Designation" value={cp.designation}
                  onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, designation: e.target.value } : p))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Email" value={cp.email}
                  onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, email: e.target.value } : p))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
                <input placeholder="Mobile" value={cp.mobile}
                  onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, mobile: e.target.value } : p))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Remarks</p>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…"
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all resize-none" />
        </div>

        {definedFields.length > 0 && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Additional Information</p>
            {definedFields.map(f => (
              <div key={f._id}>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                  {f.label}{f.required && <span className="text-[#5A0F1A]"> *</span>}
                </label>
                {f.type === 'file' ? (
                  <div className="flex items-center gap-2">
                    {definedFieldValues[f.key] && (
                      <a href={staticUrl(definedFieldValues[f.key])} target="_blank" rel="noreferrer"
                        className="text-[10px] font-black text-[#5A0F1A] whitespace-nowrap">View ↗</a>
                    )}
                    <label className="flex-1 cursor-pointer">
                      <span className="block w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-center text-slate-500 hover:bg-slate-50 transition-colors">
                        {definedFieldValues[f.key] ? 'Replace file' : 'Upload file'}
                      </span>
                      <input type="file" className="hidden" onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const res = await uploadUserAvatar(file);
                          setDefinedFieldValues(v => ({ ...v, [f.key]: res.url }));
                        } catch { setErr('Error uploading file'); }
                      }} />
                    </label>
                  </div>
                ) : f.type === 'textarea' ? (
                  <textarea rows={2} value={definedFieldValues[f.key] ?? ''} placeholder={f.placeholder}
                    onChange={e => setDefinedFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all resize-none" />
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                    value={definedFieldValues[f.key] ?? ''} placeholder={f.placeholder}
                    onChange={e => setDefinedFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
                )}
              </div>
            ))}
          </div>
        )}

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [customer, setCustomer] = useState<FullCustomer | null>(null);
  const [enquiries, setEnquiries] = useState<SaleEnquiry[]>([]);
  const [purchases, setPurchases] = useState<InventoryItem[]>([]);
  const [plans, setPlans] = useState<GoldBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [tab, setTab] = useState<'enquiries' | 'purchases' | 'plans' | 'advances'>('enquiries');
  const [customFieldDefs, setCustomFieldDefs] = useState<EmployeeCustomField[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [certGeneratingId, setCertGeneratingId] = useState<string | null>(null);
  const [certError, setCertError] = useState('');

  // Customer advances (money taken against a future purchase)
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(true);
  const [showAddAdvance, setShowAddAdvance] = useState(false);
  const [advAmount, setAdvAmount] = useState('');
  const [advWaiverPct, setAdvWaiverPct] = useState('');
  const [advMode, setAdvMode] = useState('cash');
  const [advLockInDays, setAdvLockInDays] = useState(0);
  const [advCustomLock, setAdvCustomLock] = useState(false);
  const [advNote, setAdvNote] = useState('');
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [receiptAdvance, setReceiptAdvance] = useState<CustomerAdvance | null>(null);

  async function handleGenerateCertificate(item: InventoryItem) {
    setCertGeneratingId(item._id);
    setCertError('');
    try {
      const cert = await generateCertificate(item._id);
      window.open(staticUrl(cert.url), '_blank');
    } catch (e: any) {
      setCertError(e.message || 'Certificate generation failed');
    } finally {
      setCertGeneratingId(null);
    }
  }

  async function handleAddAdvance() {
    const amt = parseFloat(advAmount);
    if (!amt || amt <= 0) return;
    setAdvanceError('');
    setSavingAdvance(true);
    try {
      const created = await createCustomerAdvance(id, {
        amount: amt,
        making_charges_waiver_pct: parseFloat(advWaiverPct) || 0,
        mode: advMode,
        note: advNote || undefined,
        lock_in_days: advLockInDays || 0,
      });
      setAdvances(prev => [created, ...prev]);
      setShowAddAdvance(false);
      setAdvAmount(''); setAdvWaiverPct(''); setAdvNote(''); setAdvLockInDays(0); setAdvCustomLock(false);
      setReceiptAdvance(created);
    } catch (e: any) {
      setAdvanceError(e?.message || 'Failed to record advance');
    } finally {
      setSavingAdvance(false);
    }
  }

  useEffect(() => {
    getCustomerCustomFields().catch(() => [] as EmployeeCustomField[]).then(setCustomFieldDefs);
  }, []);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    Promise.all([getCustomerById(id), getMyEnquiries()])
      .then(([c, allEnquiries]) => {
        setCustomer(c);
        setEnquiries(allEnquiries.filter(e => {
          const cid = typeof e.customer_id === 'object' ? e.customer_id._id : e.customer_id;
          return cid === id;
        }));
        setLoadingAdvances(true);
        getCustomerAdvances(id).catch(() => []).then(setAdvances).finally(() => setLoadingAdvances(false));
        if (c?.phone) {
          setLoadingHistory(true);
          Promise.all([
            getCustomerPurchases(c.phone).catch(() => []),
            getCustomerGoldBalance(c.phone).catch(() => []),
          ]).then(([p, g]) => { setPurchases(p); setPlans(g); }).finally(() => setLoadingHistory(false));
        } else {
          setLoadingHistory(false);
        }
      })
      .catch(() => { localStorage.removeItem('sales_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
    </div>
  );

  if (!customer) return (
    <div className="flex h-full items-center justify-center p-12 text-slate-400 font-bold text-sm">Customer not found.</div>
  );

  const totalCommission = enquiries.reduce((s, e) => s + e.commission_amount, 0);

  const TABS: { id: typeof tab; label: string; count: number }[] = [
    { id: 'enquiries', label: 'Enquiries', count: enquiries.length },
    { id: 'purchases', label: 'Purchase History', count: purchases.length },
    { id: 'plans', label: 'Investment Plans', count: plans.length },
    { id: 'advances', label: 'Advances', count: advances.length },
  ];
  const totalAdvanceBalance = advances.reduce((s, a) => s + a.availableBalance, 0);

  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto min-h-full space-y-6 pb-20">
      <Link href="/dashboard/customers" className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#5A0F1A] transition-colors">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Customers
      </Link>

      <div className="bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#5A0F1A] flex items-center justify-center text-xl font-black text-white flex-shrink-0">
              {initials(customer.name)}
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">{customer.name}</h1>
              <p className="text-sm text-slate-500 font-medium mt-0.5">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ID: {customer._id.slice(-8).toUpperCase()}
                {(customer.city || customer.state) && ` · ${[customer.city, customer.state].filter(Boolean).join(', ')}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <button onClick={() => setShowEdit(true)}
              className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-[#5A0F1A]/30 hover:text-[#5A0F1A] transition-all">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7m-1.5-9.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Edit
            </button>
            <Link href={`/dashboard/enquiries?new=1&customer_id=${customer._id}`}
              className="flex items-center gap-2 px-5 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-[#5A0F1A]/20 transition-all">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Raise Enquiry
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Onboarded</p>
            <p className="text-sm font-bold text-slate-800">{fmt(customer.createdAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Purchases</p>
            <p className="text-sm font-bold text-slate-800">{purchases.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Investment Plans</p>
            <p className="text-sm font-bold text-slate-800">{plans.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Commission Earned</p>
            <p className="text-sm font-bold text-[#5A0F1A]">{rupee(totalCommission)}</p>
          </div>
        </div>

        {(customer.customFields?.length ?? 0) > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
            {customer.customFields!.map((f, i) => {
              const def = customFieldDefs.find(d => d.key === f.key);
              const label = def?.label ?? f.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <div key={i}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{f.value}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="flex gap-1 px-4 sm:px-6 pt-4 border-b border-slate-100">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                tab === t.id ? 'text-[#5A0F1A] border-b-2 border-[#5A0F1A]' : 'text-slate-400 hover:text-slate-600'
              }`}>
              {t.label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-[#5A0F1A]/10 text-[#5A0F1A]' : 'bg-slate-100 text-slate-400'}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* ── Enquiries ── */}
        {tab === 'enquiries' && (
          enquiries.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-bold text-slate-400">No enquiries raised yet</p>
              <p className="text-[11px] text-slate-300 mt-1">Raise one once this customer buys an item or invests</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {enquiries.map(e => {
                const cfg = STATUS_CFG[e.status];
                return (
                  <div key={e._id} className="px-6 sm:px-8 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900">{TYPE_LABEL[e.type]}</p>
                      <p className="text-[11px] text-slate-400 truncate">{e.description}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="text-sm font-black text-slate-700">{rupee(e.amount)}</p>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── Purchase History ── */}
        {tab === 'purchases' && (
          loadingHistory ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-bold text-slate-400">No purchase history found</p>
              <p className="text-[11px] text-slate-300 mt-1">This customer has not bought any store items yet.</p>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-3">
              {certError && <p className="text-xs text-red-600 font-bold">{certError}</p>}
              {purchases.map(item => {
                const product = typeof item.product_id === 'object' ? item.product_id : null;
                const img = product?.images?.[0];
                return (
                  <div key={item._id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-200 transition-colors">
                    {img ? (
                      <img src={staticUrl(img)} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-slate-100" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate">{product?.name ?? item.unique_item_code}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{item.unique_item_code}</p>
                    </div>
                    <div className="flex-shrink-0 text-right flex items-center gap-3">
                      <p className="text-sm font-black text-slate-900">{rupee(item.selling_price)}</p>
                      <button
                        onClick={() => handleGenerateCertificate(item)}
                        disabled={certGeneratingId === item._id}
                        title="Certificate of Authenticity"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white border border-amber-200 hover:border-amber-600 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                      >
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {certGeneratingId === item._id ? '…' : 'Certificate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── Investment Plans ── */}
        {tab === 'plans' && (
          loadingHistory ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-bold text-slate-400">No investment plans found</p>
              <p className="text-[11px] text-slate-300 mt-1">This customer is not enrolled in any gold savings plan.</p>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-4">
              {plans.map(sub => (
                <div key={sub._id} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-start justify-between bg-gradient-to-br from-[#5A0F1A] to-[#3D0A11]">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-rose-200 mb-0.5">Gold Savings Plan</p>
                      <p className="text-base font-black text-white">{sub.plan?.name || 'Gold Plan'}</p>
                      <p className="text-[10px] text-rose-200 mt-0.5">{sub.plan?.interestRate}% p.a. · {sub.plan?.durationMonths} months</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${PLAN_STATUS_COLOR[sub.status]}`}>{sub.status}</span>
                  </div>
                  <div className="p-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-[8px] font-black uppercase text-slate-300 mb-1">Monthly</p>
                      <p className="text-xs font-bold text-slate-800">{sub.plan ? rupee(sub.plan.monthlyAmount) : '—'}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-[8px] font-black uppercase text-slate-300 mb-1">Installments</p>
                      <p className="text-xs font-bold text-slate-800">{sub.installmentsPaid} / {sub.plan?.durationMonths ?? '—'}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-100">
                      <p className="text-[8px] font-black uppercase text-emerald-400 mb-1">Balance</p>
                      <p className="text-xs font-bold text-emerald-700">{rupee(sub.availableBalance)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Advances ── */}
        {tab === 'advances' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="rounded-2xl p-5 border" style={{ background: '#5A0F1A0a', borderColor: '#5A0F1A25' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#5A0F1A]">Advance Balance</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{rupee(totalAdvanceBalance)}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Available to redeem</p>
                </div>
                <button
                  onClick={() => setShowAddAdvance(v => !v)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black text-white transition-all bg-[#5A0F1A] hover:bg-[#7A1C2A]"
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add Advance
                </button>
              </div>
            </div>

            {showAddAdvance && (
              <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Amount (₹) *</label>
                  <input type="number" min="1" value={advAmount} onChange={e => setAdvAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Making Charges Waiver (%)</label>
                  <input type="number" min="0" max="100" step="0.1" value={advWaiverPct} onChange={e => setAdvWaiverPct(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Mode</label>
                  <select value={advMode} onChange={e => setAdvMode(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none bg-white">
                    {['cash', 'bank_transfer', 'upi', 'cheque'].map(m => (
                      <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Lock-in Period</label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[{ label: 'No Lock', days: 0 }, { label: '30 Days', days: 30 }, { label: '60 Days', days: 60 }, { label: '90 Days', days: 90 }].map(p => (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => { setAdvLockInDays(p.days); setAdvCustomLock(false); }}
                        className="px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all"
                        style={!advCustomLock && advLockInDays === p.days ? { background: '#5A0F1A', color: 'white', borderColor: '#5A0F1A' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setAdvCustomLock(v => !v)} className="text-[10px] font-black text-[#5A0F1A] transition-colors">
                    {advCustomLock ? '− Hide custom days' : '+ Custom days'}
                  </button>
                  {advCustomLock && (
                    <input type="number" min="0" value={advLockInDays || ''} onChange={e => setAdvLockInDays(parseInt(e.target.value) || 0)}
                      placeholder="Number of days"
                      className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none" />
                  )}
                  <p className="text-[10px] text-slate-400 font-medium mt-1.5">
                    {advLockInDays > 0 ? `Cannot be redeemed for ${advLockInDays} day${advLockInDays > 1 ? 's' : ''} from today.` : 'Redeemable anytime once recorded.'}
                  </p>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Note (optional)</label>
                  <input value={advNote} onChange={e => setAdvNote(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
                {advanceError && <p className="text-xs text-red-600 font-bold">{advanceError}</p>}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowAddAdvance(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleAddAdvance} disabled={savingAdvance || !advAmount || parseFloat(advAmount) <= 0}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-black transition-colors disabled:opacity-40 bg-[#5A0F1A] hover:bg-[#7A1C2A]">
                    {savingAdvance ? 'Saving…' : 'Record Advance'}
                  </button>
                </div>
              </div>
            )}

            {loadingAdvances ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
              </div>
            ) : advances.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 font-bold text-sm">No advances recorded</p>
                <p className="text-slate-300 text-xs mt-1">Record an advance payment to track it here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {advances.map(a => {
                  const creator = a.createdBy && typeof a.createdBy === 'object' ? a.createdBy.name : null;
                  return (
                    <div key={a._id} className="border border-slate-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-black text-slate-900">{rupee(a.amount)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {fmt(a.createdAt)} · {a.mode.replace('_', ' ')}{creator && ` · by ${creator}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setReceiptAdvance(a)} className="px-2 py-1 rounded-full text-[8px] font-black uppercase border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all">
                              Receipt
                            </button>
                            <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${a.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                              {a.status}
                            </span>
                          </div>
                          {a.locked && (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase border bg-amber-50 text-amber-700 border-amber-200">
                              Locked till {fmt(a.lock_in_expires_at!)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
                          <p className="text-[8px] font-black uppercase text-slate-300 mb-0.5">Redeemed</p>
                          <p className="text-xs font-bold text-slate-800">{rupee(a.amountRedeemed || 0)}</p>
                        </div>
                        <div className="rounded-xl p-2.5 bg-emerald-50 border border-emerald-100">
                          <p className="text-[8px] font-black uppercase text-emerald-400 mb-0.5">Available</p>
                          <p className="text-xs font-bold text-emerald-700">{rupee(a.availableBalance)}</p>
                        </div>
                        <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
                          <p className="text-[8px] font-black uppercase text-slate-300 mb-0.5">Waiver</p>
                          <p className="text-xs font-bold text-slate-800">{a.making_charges_waiver_pct || 0}%</p>
                        </div>
                      </div>
                      {a.note && <p className="text-[10px] text-slate-400 italic">{a.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <EditCustomerModal
        open={showEdit}
        customer={customer}
        definedFields={customFieldDefs}
        onClose={() => setShowEdit(false)}
        onSaved={(updated) => { setCustomer(updated); setShowEdit(false); }}
      />

      {receiptAdvance && (
        <AdvanceReceiptModal advance={receiptAdvance} onClose={() => setReceiptAdvance(null)} />
      )}
    </div>
  );
}
