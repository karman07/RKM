'use client';
import ChangePasswordCard from '@/components/ChangePasswordCard';
import { changeOwnPassword } from '@/lib/api';

export default function AccountPage() {
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">My Account</h1>
        <p className="text-sm text-slate-500 mt-1">Change the password you use to sign in.</p>
      </div>
      <ChangePasswordCard onSubmit={changeOwnPassword} />
    </div>
  );
}
