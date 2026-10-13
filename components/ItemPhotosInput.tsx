'use client';
import { useRef, useState } from 'react';
import { uploadItemImages, staticUrl } from '@/lib/api';

const MAX_PHOTOS = 6;

/**
 * Photos of an old-gold / gold-loan item. At least one is required — it is the record of what was
 * actually received or pledged. On phones the picker offers the camera directly.
 */
export default function ItemPhotosInput({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - value.length;
    const picked = Array.from(files).slice(0, room);
    if (picked.length === 0) { setError(`Up to ${MAX_PHOTOS} photos per item`); return; }
    setUploading(true); setError('');
    try {
      const urls = await uploadItemImages(picked);
      onChange([...value, ...urls]);
    } catch (e: any) {
      setError(e?.message || 'Upload failed — use JPG, PNG or WebP photos');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="col-span-2">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          Item Photos <span className="text-red-500">*</span>
        </label>
        <span className="text-[9px] font-bold text-slate-400">{value.length}/{MAX_PHOTOS}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-white group">
            <a href={staticUrl(url)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={staticUrl(url)} alt={`Item photo ${i + 1}`} className="w-full h-full object-cover" />
            </a>
            <button
              type="button"
              onClick={() => onChange(value.filter(u => u !== url))}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] leading-none flex items-center justify-center opacity-90 hover:bg-red-600"
              title="Remove photo"
            >×</button>
          </div>
        ))}
        {value.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600 flex flex-col items-center justify-center text-[9px] font-black uppercase gap-0.5 disabled:opacity-50"
          >
            {uploading ? <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" /> : <><span className="text-lg leading-none">+</span>Photo</>}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      {value.length === 0 && !error && <p className="text-[10px] text-red-500 font-bold mt-1">At least one photo is required</p>}
      {error && <p className="text-[10px] text-red-600 font-bold mt-1">{error}</p>}
    </div>
  );
}
