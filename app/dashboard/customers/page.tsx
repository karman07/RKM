'use client';
import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getProfile, getMyCustomers, createCustomer, checkSessionExpiry, GST_TREATMENTS,
  getCustomerCustomFields, uploadUserAvatar, staticUrl,
  type UserProfile, type FullCustomer, type EmployeeCustomField,
} from '../../../lib/api';
import Modal from '../../../components/Modal';

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function AddCustomerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: FullCustomer) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [showMore, setShowMore] = useState(false);
  const [customerSubType, setCustomerSubType] = useState<'individual' | 'business'>('individual');
  const [companyName, setCompanyName] = useState('');
  const [salutation, setSalutation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [gstTreatment, setGstTreatment] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');

  const [definedFields, setDefinedFields] = useState<EmployeeCustomField[]>([]);
  const [definedFieldValues, setDefinedFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    getCustomerCustomFields().catch(() => [] as EmployeeCustomField[]).then(setDefinedFields);
  }, [open]);

  function reset() {
    setName(''); setPhone(''); setEmail(''); setCity(''); setAddress(''); setErr('');
    setDefinedFieldValues({});
    setShowMore(false); setCustomerSubType('individual'); setCompanyName('');
    setSalutation(''); setFirstName(''); setLastName(''); setWorkPhone(''); setWebsite('');
    setGstTreatment(''); setGstNo(''); setPlaceOfSupply('');
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Customer name is required'); return; }
    if (phone.replace(/\D/g, '').length !== 10) { setErr('Enter a valid 10-digit mobile number'); return; }
    const missingDefined = definedFields.filter(f => f.required && !definedFieldValues[f.key]?.trim());
    if (missingDefined.length) { setErr(`Missing required field(s): ${missingDefined.map(f => f.label).join(', ')}`); return; }
    setErr(''); setSaving(true);
    try {
      const validDefinedFields = definedFields
        .filter(f => definedFieldValues[f.key]?.trim())
        .map(f => ({ key: f.key, value: definedFieldValues[f.key] }));
      const customer = await createCustomer({
        name: name.trim(),
        phone: `+91${phone.replace(/^\+91/, '')}`,
        email: email.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        customFields: validDefinedFields.length ? validDefinedFields : undefined,
        customer_sub_type: customerSubType,
        company_name: customerSubType === 'business' ? companyName.trim() || undefined : undefined,
        salutation: salutation || undefined,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        work_phone: workPhone.trim() || undefined,
        website: website.trim() || undefined,
        gst_treatment: (gstTreatment || undefined) as any,
        gst_no: gstNo.trim() || undefined,
        place_of_supply: placeOfSupply.trim() || undefined,
      });
      onCreated(customer);
      reset();
    } catch (e: any) {
      setErr(e.message || 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add Customer">
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Customer Type</label>
          <div className="flex gap-2">
            {(['individual', 'business'] as const).map(t => (
              <button key={t} type="button" onClick={() => setCustomerSubType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all ${customerSubType === t ? 'bg-[#5A0F1A] text-white border-[#5A0F1A]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Full Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer full name" autoFocus
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
        </div>
        {customerSubType === 'business' && (
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Company Name</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company / business name"
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
          </div>
        )}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Phone Number *</label>
          <div className="flex rounded-2xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#5A0F1A]/10 focus-within:border-[#5A0F1A]">
            <div className="flex items-center gap-1.5 px-3 bg-slate-50 border-r border-slate-200 text-sm font-bold text-slate-600 whitespace-nowrap">
              +91
            </div>
            <input type="tel" placeholder="10 digit mobile number" value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="flex-1 px-4 py-3 text-sm focus:outline-none" />
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

        <button type="button" onClick={() => setShowMore(v => !v)} className="text-[10px] font-black text-[#5A0F1A] hover:underline">
          {showMore ? '− Hide' : '+ Add'} contact person, GST &amp; other details
        </button>

        {showMore && (
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
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
            <select value={gstTreatment} onChange={e => setGstTreatment(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]">
              <option value="">Select a GST treatment</option>
              {GST_TREATMENTS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="GSTIN" value={gstNo} onChange={e => setGstNo(e.target.value.toUpperCase())}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
              <input placeholder="Place of supply" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A]" />
            </div>
          </div>
        )}

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
          <button onClick={() => { reset(); onClose(); }} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : 'Save Customer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CustomersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [customers, setCustomers] = useState<FullCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const limit = 200;
      const first = await getMyCustomers(1, limit);
      let all = first.data ?? [];
      const totalPages = first.meta?.total_pages ?? 1;
      if (totalPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => getMyCustomers(i + 2, limit))
        );
        all = all.concat(...rest.map(r => r.data ?? []));
      }
      setCustomers(all);
    } catch (e: any) {
      showToast(e.message || 'Failed to load customers', false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(async (profile) => { setUser(profile); await load(); })
      .catch(() => { localStorage.removeItem('sales_session'); router.replace('/login'); });
  }, [router, load]);

  useEffect(() => { if (searchParams.get('add') === '1') setShowAdd(true); }, [searchParams]);

  const filtered = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        (c.phone ?? '').includes(q) ||
        (c.email ?? '').toLowerCase().includes(q.toLowerCase())
      )
    : customers;

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto min-h-full space-y-6 pb-20">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <AddCustomerModal
        open={showAdd}
        onClose={() => { setShowAdd(false); router.replace('/dashboard/customers'); }}
        onCreated={(c) => {
          showToast(`${c.name} added successfully`);
          setShowAdd(false);
          router.replace('/dashboard/customers');
          load();
        }}
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Customers</h1>
          <p className="text-slate-400 font-medium mt-0.5 text-sm">{customers.length} customer{customers.length !== 1 ? 's' : ''} available</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Customer
        </button>
      </div>

      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input placeholder="Search by name, phone or email…" value={q} onChange={e => setQ(e.target.value)}
          className="w-full border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] bg-white transition-all" />
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-16 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-[#5A0F1A]/10">
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-slate-900 font-black text-lg mb-1">{q ? 'No customers match your search' : 'No customers yet'}</p>
          <p className="text-slate-400 text-sm mb-6">{q ? 'Try a different name, phone, or email.' : 'Add your first customer to start building commission.'}</p>
          {!q && (
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] rounded-2xl text-white text-sm font-black transition-all">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Customer
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Link key={c._id} href={`/dashboard/customers/${c._id}`}
              className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all block">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-2xl bg-[#5A0F1A] flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 text-sm leading-snug truncate">{c.name}</p>
                  {c.phone && <p className="text-[11px] text-slate-400 font-medium">{c.phone}</p>}
                </div>
              </div>
              <div className="space-y-1">
                {c.email && <p className="text-[11px] text-slate-500 truncate">{c.email}</p>}
                {(c.city || c.state) && <p className="text-[11px] text-slate-500 truncate">{[c.city, c.state].filter(Boolean).join(', ')}</p>}
                <p className="text-[10px] text-slate-400 font-medium">Joined {fmt(c.createdAt)}</p>
              </div>
              {typeof c.relationship_manager === 'object' && c.relationship_manager && (
                <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-[#5A0F1A] bg-[#5A0F1A]/5 border border-[#5A0F1A]/10 rounded-xl px-3 py-2 w-fit">
                  Added by {c.relationship_manager._id === user?._id ? 'you' : c.relationship_manager.name}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
      </div>
    }>
      <CustomersPageInner />
    </Suspense>
  );
}
