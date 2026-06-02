"use client";

import React from 'react';
import { LogOut, X } from 'lucide-react';

interface LogoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function LogoutDialog({ isOpen, onClose, onConfirm }: LogoutDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative w-full max-w-sm bg-white rounded-[40px] shadow-[0_30px_100px_rgba(0,0,0,0.2)] border border-slate-50 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-all"
        >
          <X size={18} />
        </button>

        <div className="p-10 pt-16 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-8 ring-8 ring-red-50/50">
            <LogOut size={32} strokeWidth={1.5} />
          </div>

          <h3 className="text-2xl font-serif font-bold text-slate-900 mb-3">Sign Out?</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed px-4">
            Are you sure you want to end your boutique session?
          </p>

          <div className="grid grid-cols-1 w-full gap-3 mt-12 pb-2">
            <button 
              onClick={onConfirm}
              className="w-full py-4 bg-[#7A1238] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#14532d] hover:-translate-y-1 active:scale-95 transition-all"
            >
              Confirm Sign Out
            </button>
            <button 
              onClick={onClose}
              className="w-full py-4 bg-white text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl hover:text-slate-900 transition-all"
            >
              Stay Logged In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
