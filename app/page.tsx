'use client';

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function createFeedback(data: any | any[]) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to submit feedback');
  }
  return res.json();
}

type FormState = {
  channel: 'in-store' | 'online';
  storeCode: string;
  title: string;
  gender: string;
  name: string;
  dialCode: string;
  mobile: string;
  email: string;
  dob: string;
  country: string;
  state: string;
  district: string;
  address: string;
  type: 'conversion' | 'non-conversion';
  overallExperience: string;
  staffHelpfulness: string;
  visitAgain: string;
  recommend: string;
  notPurchaseReason: string;
  notPurchaseReasonOther: string;
  categoryLookingFor: string;
  categoryLookingForOther: string;
  typeLookingFor: string;
  typeLookingForOther: string;
  priceBand: string;
  weightBand: string;
};

const initialFormState: FormState = {
  channel: 'online',
  storeCode: '',
  title: 'Mr',
  gender: 'M',
  name: '',
  dialCode: '+91',
  mobile: '',
  email: '',
  dob: '',
  country: 'India',
  state: '',
  district: '',
  address: '',
  type: 'conversion',
  overallExperience: '',
  staffHelpfulness: '',
  visitAgain: '',
  recommend: '',
  notPurchaseReason: '',
  notPurchaseReasonOther: '',
  categoryLookingFor: '',
  categoryLookingForOther: '',
  typeLookingFor: '',
  typeLookingForOther: '',
  priceBand: '',
  weightBand: '',
};

export default function FeedbackForm() {
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  
  const [branches, setBranches] = useState<{ _id: string, name: string, code: string }[]>([
    { _id: '1', name: 'Main Store', code: 'MAIN' },
  ]);
  
  const [dialCodes, setDialCodes] = useState<any[]>([]);
  const [countriesData, setCountriesData] = useState<any[]>([]);
  const [districtsList, setDistrictsList] = useState<string[]>([]);

  // Base Color - Reverted to GREENISH as requested
  const brandGreen = '#1A2E26';
  const brandGold = '#B8975A';

  useEffect(() => {
    // Check if already submitted
    const hasSubmitted = localStorage.getItem('feedback_submitted');
    if (hasSubmitted) {
      setIsSubmitted(true);
    }

    fetch(`${API_BASE}/branches`, { mode: 'cors' })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
         const list = Array.isArray(data) ? data : (data?.data || []);
         if (list.length > 0) setBranches(list);
      })
      .catch(() => {});

    fetch('https://countriesnow.space/api/v0.1/countries/codes')
      .then(res => res.json())
      .then(data => !data.error && setDialCodes(data.data))
      .catch(() => {});

    fetch('https://countriesnow.space/api/v0.1/countries/states')
      .then(res => res.json())
      .then(data => !data.error && setCountriesData(data.data))
      .catch(() => {});
  }, []);

  const getStates = () => {
    const c = countriesData.find(c => c.name === formData.country);
    return c ? c.states : [];
  };

  useEffect(() => {
    if (formData.country && formData.state) {
      fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: formData.country, state: formData.state })
      })
      .then(res => res.json())
      .then(data => setDistrictsList(data.data || []))
      .catch(() => setDistrictsList([]));
    } else {
      setDistrictsList([]);
    }
  }, [formData.country, formData.state]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    if (type === 'radio') {
      if ((e.target as HTMLInputElement).checked) {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const autofillLocation = async () => {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`);
      const data = await res.json();
      
      setFormData(prev => ({
        ...prev,
        country: data.countryName || prev.country,
        state: data.principalSubdivision || prev.state,
        district: data.city || data.locality || prev.district
      }));
    } catch (e) {
      console.log('Location access denied or failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    
    try {
      const payload = { 
        ...formData, 
        mobile: `${formData.dialCode} ${formData.mobile}`,
        storeCode: formData.channel === 'online' ? (formData.storeCode || 'ONLINE') : formData.storeCode 
      };
      await createFeedback(payload);
      
      // Save to localStorage
      localStorage.setItem('feedback_submitted', 'true');
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError('Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-[#FDFCF9] flex items-center justify-center p-8 font-sans text-[#1A2E26]">
        <div className="max-w-xl w-full bg-white shadow-[0_20px_50px_rgba(26,46,38,0.05)] border border-[#1A2E26]/5 rounded-[2.5rem] p-16 text-center animate-in fade-in zoom-in duration-700">
           <div className="w-20 h-20 bg-[#1A2E26] rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl">
             <div className="w-10 h-0.5 bg-white rotate-45 translate-y-1.5 translate-x-2"></div>
             <div className="w-5 h-0.5 bg-white -rotate-45 -translate-y-1.5 -translate-x-1"></div>
           </div>
           <h1 className="text-3xl font-serif font-bold uppercase tracking-tight mb-4 text-[#1A2E26]">Submission Received</h1>
           <p className="text-[#B8975A] text-xs font-black uppercase tracking-[0.3em] mb-10">Thank you for your response</p>
           <div className="h-px w-20 bg-[#F7F5F0] mx-auto mb-10"></div>
           <p className="text-sm text-[#1A2E26]/60 leading-relaxed max-w-xs mx-auto">
             Your feedback has been successfully recorded in our registry. We appreciate your time.
           </p>
           <button 
             onClick={() => {
               localStorage.removeItem('feedback_submitted');
               setIsSubmitted(false);
             }}
             className="mt-12 text-[9px] font-black uppercase tracking-widest text-[#B8975A] hover:text-[#1A2E26] transition-colors"
           >
             Submit another response
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCF9] p-0 sm:p-8 font-sans text-[#1A2E26] selection:bg-[#B8975A]/20">
      <div className="max-w-4xl mx-auto bg-white sm:shadow-[0_20px_50px_rgba(26,46,38,0.05)] sm:border border-[#1A2E26]/5 sm:rounded-[2.5rem] overflow-hidden min-h-screen sm:min-h-0">
        
        {/* Header */}
        <div className="p-12 sm:p-20 text-center border-b border-[#F7F5F0] bg-white relative">
          <h1 className="text-4xl sm:text-5xl font-serif text-[#1A2E26] tracking-tight font-bold uppercase mb-4 decoration-[#B8975A] decoration-2">RKM Jewellers</h1>
          <div className="flex items-center justify-center gap-4 mb-6">
             <div className="h-px w-12 bg-[#B8975A]/30"></div>
             <p className="text-[10px] text-[#B8975A] tracking-[0.4em] font-black uppercase">Client Satisfaction Registry</p>
             <div className="h-px w-12 bg-[#B8975A]/30"></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 sm:p-14 space-y-16">
          
          {error && (
            <div className="bg-rose-500 text-white font-bold p-8 rounded-3xl text-center text-sm shadow-xl animate-in zoom-in duration-300">
               {error}
            </div>
          )}

          {/* Channel Selection */}
          <div className="space-y-6">
            <label className="block text-[11px] font-bold uppercase text-[#B8975A] tracking-[0.2em] ml-1">Engagement Channel</label>
            <div className="grid grid-cols-2 gap-4 p-2 bg-[#F7F5F0] rounded-[2rem]">
              <button type="button" onClick={() => setFormData(p => ({...p, channel: 'online'}))} className={`p-4 rounded-[1.6rem] flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-widest transition-all duration-300 ${formData.channel === 'online' ? 'bg-[#1A2E26] text-white shadow-xl' : 'text-[#1A2E26]/40 hover:text-[#1A2E26]/80'}`}>
                Online Order
              </button>
              <button type="button" onClick={() => setFormData(p => ({...p, channel: 'in-store'}))} className={`p-4 rounded-[1.6rem] flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-widest transition-all duration-300 ${formData.channel === 'in-store' ? 'bg-[#1A2E26] text-white shadow-xl' : 'text-[#1A2E26]/40 hover:text-[#1A2E26]/80'}`}>
                In-Store Visit
              </button>
            </div>
          </div>

          {/* Section 1: Identity */}
          <div className="space-y-10">
            <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-[#1A2E26] flex items-center gap-4">
              <span className="w-8 h-8 rounded-full bg-[#1A2E26] text-white flex items-center justify-center text-[10px]">01</span> 
              Core Identity
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {formData.channel === 'in-store' ? (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest ml-1">Boutique Branch</label>
                  <select required name="storeCode" value={formData.storeCode} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-4 text-sm font-bold outline-none transition-all bg-transparent cursor-pointer appearance-none">
                    <option value="" disabled>Select the store you visited</option>
                    {branches.map(b => (
                      <option key={b._id} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest ml-1">Order Reference</label>
                  <input name="storeCode" value={formData.storeCode} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3.5 text-sm font-bold outline-none transition-all bg-transparent placeholder-[#1A2E26]/20" placeholder="E.g. #ORD-1234 (Optional)" />
                </div>
              )}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest ml-1">Date of Birth</label>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3.5 text-sm font-bold outline-none transition-all bg-transparent" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
              <div className="md:col-span-3 space-y-4">
                <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest ml-1">Salutation</label>
                <div className="flex gap-2">
                  {['Mr', 'Mrs', 'Ms'].map(t => (
                    <button key={t} type="button" onClick={() => setFormData(p => ({...p, title: t}))} className={`flex-1 py-3 rounded-xl border font-bold text-[10px] uppercase transition-all ${formData.title === t ? 'bg-[#1A2E26] text-white border-[#1A2E26]' : 'border-[#F7F5F0] text-[#1A2E26]/40 hover:border-[#1A2E26]/20'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-9 space-y-2">
                <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest ml-1">Full Identification Name</label>
                <input name="name" value={formData.name} onChange={handleChange} required className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3.5 text-sm font-bold outline-none transition-all bg-transparent" placeholder="Johnathan Doe" />
              </div>
              
              <div className="md:col-span-6 space-y-2">
                <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest ml-1">Communication Number</label>
                <div className="flex gap-4">
                  <select name="dialCode" value={formData.dialCode} onChange={handleChange} className="w-32 border-b-2 border-[#F7F5F0] py-3.5 text-sm font-bold outline-none bg-transparent">
                    <option value="+91">+91</option>
                    {dialCodes.map((c, i) => <option key={i} value={c.dial_code}>{c.code} {c.dial_code}</option>)}
                  </select>
                  <input name="mobile" value={formData.mobile} onChange={handleChange} type="tel" required className="flex-1 border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3.5 text-sm font-bold outline-none bg-transparent" placeholder="9876543210" />
                </div>
              </div>

              <div className="md:col-span-6 space-y-2">
                <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest ml-1">Electronic Mail</label>
                <input name="email" value={formData.email} onChange={handleChange} type="email" className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3.5 text-sm font-bold outline-none bg-transparent" placeholder="contact@mail.com" />
              </div>
            </div>

            {/* Geography */}
            <div className="bg-[#F7F5F0] rounded-[2.5rem] p-10 space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1A2E26]">
                   Location Data
                </h3>
                <button type="button" onClick={autofillLocation} className="text-[10px] font-black uppercase text-[#B8975A] border-b border-[#B8975A]/30 pb-0.5 hover:text-[#1A2E26] hover:border-[#1A2E26] transition-all">
                   Detect my Area
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="block text-[9px] font-bold uppercase text-[#1A2E26]/30 ml-1">Nation</label>
                  <select name="country" value={formData.country} onChange={handleChange} className="w-full border-b border-[#1A2E26]/10 py-3 text-xs font-bold bg-transparent focus:border-[#1A2E26] outline-none">
                    <option value="">Select Country</option>
                    {countriesData.map((c, i) => <option key={i} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-[9px] font-bold uppercase text-[#1A2E26]/30 ml-1">State / Province</label>
                  <select name="state" value={formData.state} onChange={handleChange} className="w-full border-b border-[#1A2E26]/10 py-3 text-xs font-bold bg-transparent focus:border-[#1A2E26] outline-none">
                    <option value="">Select State</option>
                    {getStates().map((s: any, i: number) => <option key={i} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-[9px] font-bold uppercase text-[#1A2E26]/30 ml-1">City / District</label>
                  <select name="district" value={formData.district} onChange={handleChange} className="w-full border-b border-[#1A2E26]/10 py-3 text-xs font-bold bg-transparent focus:border-[#1A2E26] outline-none">
                    <option value="">Select City</option>
                    {districtsList.map((d, i) => <option key={i} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[9px] font-bold uppercase text-[#1A2E26]/30 ml-1">Physical Address</label>
                <input name="address" value={formData.address} onChange={handleChange} className="w-full border-b border-[#1A2E26]/10 py-3 text-xs font-bold bg-transparent outline-none focus:border-[#1A2E26] placeholder-[#1A2E26]/20" placeholder="Street number, landmark, locality..." />
              </div>
            </div>
          </div>

          <hr className="border-[#F7F5F0]" />

          {/* Outcome Toggles */}
          <div className="space-y-8">
             <label className="block text-[11px] font-bold uppercase text-[#B8975A] tracking-[0.2em] ml-1">Acquisition Outcome</label>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <button type="button" onClick={() => setFormData(p => ({...p, type: 'conversion'}))} className={`p-8 rounded-[2rem] border-2 transition-all duration-300 flex flex-col items-center gap-4 ${formData.type === 'conversion' ? 'bg-white border-[#1A2E26] shadow-2xl scale-[1.03]' : 'bg-[#F7F5F0] border-transparent grayscale opacity-40'}`}>
                   <span className="text-[11px] font-black uppercase tracking-widest text-[#1A2E26]">Purchase Completed</span>
                </button>
                <button type="button" onClick={() => setFormData(p => ({...p, type: 'non-conversion'}))} className={`p-8 rounded-[2rem] border-2 transition-all duration-300 flex flex-col items-center gap-4 ${formData.type === 'non-conversion' ? 'bg-white border-[#1A2E26] shadow-2xl scale-[1.03]' : 'bg-[#F7F5F0] border-transparent grayscale opacity-40'}`}>
                   <span className="text-[11px] font-black uppercase tracking-widest text-[#1A2E26]">Just Exploring</span>
                </button>
             </div>
          </div>

          {/* Section 2: Experience Detail */}
          {formData.type === 'conversion' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom duration-500">
              <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-[#1A2E26] flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-[#1A2E26] text-white flex items-center justify-center text-[10px]">02</span> 
                Experience Registry
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {[
                  { q: 'Overall Atmosphere', name: 'overallExperience', opts: ['Wow', 'Good', 'Adequate'] },
                  { q: 'Attendant Service', name: 'staffHelpfulness', opts: ['Wow', 'Good', 'Adequate'] },
                  { q: 'Revisitation Intent', name: 'visitAgain', opts: ['Yes', 'Maybe', 'No'] },
                  { q: 'Advocacy Likelihood', name: 'recommend', opts: ['Yes', 'Maybe', 'No'] },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-6 bg-[#F7F5F0]/50 p-6 rounded-2xl border border-[#F7F5F0]">
                    <p className="text-[10px] font-black text-[#1A2E26] uppercase tracking-widest">{item.q}</p>
                    <div className="flex gap-2">
                       {item.opts.map(o => (
                         <button key={o} type="button" onClick={() => setFormData(p => ({...p, [item.name]: o}))} className={`flex-1 py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${formData[item.name as keyof FormState] === o ? 'bg-[#1A2E26] text-white border-[#1A2E26] shadow-lg' : 'bg-white border-[#F7F5F0] text-[#1A2E26]/40 hover:border-[#1A2E26]/20'}`}>
                            {o}
                         </button>
                       ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Rejection Detail */}
          {formData.type === 'non-conversion' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom duration-500">
              <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-[#1A2E26] flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-[#1A2E26] text-white flex items-center justify-center text-[10px]">02</span> 
                Market Feedback
              </h2>
              
              <div className="space-y-10">
                <div className="space-y-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#1A2E26]">Decision Rationale</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {['Just Browsing', 'Pricing Strategy', 'Design Gap', 'Service Level', 'Inventory Range', 'Other'].map(opt => (
                      <button key={opt} type="button" onClick={() => setFormData(p => ({...p, notPurchaseReason: opt}))} className={`p-4 rounded-xl border font-bold text-[10px] uppercase tracking-wider transition-all text-center ${formData.notPurchaseReason === opt ? 'bg-[#1A2E26] text-white border-[#1A2E26]' : 'bg-[#F7F5F0] border-transparent text-[#1A2E26]/50 hover:bg-[#F7F5F0]/80'}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {formData.notPurchaseReason === 'Other' && (
                     <input name="notPurchaseReasonOther" placeholder="Specify reason..." value={formData.notPurchaseReasonOther} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3 text-sm font-bold bg-transparent outline-none transition-all placeholder-[#1A2E26]/20" autoFocus />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest">Target Ornament</label>
                    <select name="categoryLookingFor" value={formData.categoryLookingFor} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3 text-sm font-bold bg-transparent outline-none">
                       <option value="">Select Ornament</option>
                       {['Bangles', 'Earrings', 'Necklace', 'Sets', 'Pendants', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest">Material Preference</label>
                    <select name="typeLookingFor" value={formData.typeLookingFor} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3 text-sm font-bold bg-transparent outline-none">
                       <option value="">Select Material</option>
                       {['Gold', 'Diamond', 'Platinum', 'Polki', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                   <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest">Price Band Target</label>
                      <input name="priceBand" placeholder="E.g. Under ₹2,00,000" value={formData.priceBand} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3 text-sm font-bold bg-transparent outline-none" />
                   </div>
                   <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase text-[#1A2E26]/40 tracking-widest">Weight Objective</label>
                      <input name="weightBand" placeholder="E.g. 15g - 25g" value={formData.weightBand} onChange={handleChange} className="w-full border-b-2 border-[#F7F5F0] focus:border-[#1A2E26] py-3 text-sm font-bold bg-transparent outline-none" />
                   </div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-10">
            <button disabled={isSubmitting} type="submit" className="w-full bg-[#1A2E26] hover:bg-[#2A4E46] text-white font-black uppercase tracking-[0.5em] py-8 rounded-[2.5rem] text-sm transition-all shadow-2xl active:scale-[0.98] disabled:opacity-50">
               {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
            <p className="text-center text-[9px] uppercase tracking-[0.3em] text-[#B8975A] mt-10 font-black">
               Thank you for your response
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
