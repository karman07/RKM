'use client';

import { useEffect, useMemo, useState } from 'react';
import { getInventory, type InventoryItem } from '@/lib/api';

export default function SoldInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getInventory({ status: 'sold', limit: '200', page: '1' })
      .then((res) => setItems(res.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load sold inventory'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const productName = typeof item.product_id === 'object' ? item.product_id.name : '';
      const haystack = [
        item.unique_item_code,
        item.barcode,
        productName,
        item.sold_customer_name,
        item.sold_customer_phone,
        item.sale_channel,
        item.payment_mode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sold Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">Complete sold item details with customer, shipping and payment information.</p>
        </div>
        <input
          className="w-72 px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sold records..."
        />
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">No sold inventory records found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Item</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Shipping</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Sale / Payment</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const productName = typeof item.product_id === 'object' ? item.product_id.name : '—';
                return (
                  <tr key={item._id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{productName}</p>
                      <p className="text-xs text-slate-500 mt-1">Code: {item.unique_item_code}</p>
                      <p className="text-xs text-slate-500">Barcode: {item.barcode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.sold_customer_name || '—'}</p>
                      <p className="text-xs text-slate-600 mt-1">Phone: {item.sold_customer_phone || '—'}</p>
                      <p className="text-xs text-slate-600">Email: {item.sold_customer_email || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700 text-xs leading-5">{item.shipping_address || '—'}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {[item.shipping_city, item.shipping_state, item.shipping_pincode, item.shipping_country]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">Channel: <span className="font-medium">{item.sale_channel || '—'}</span></p>
                      <p className="text-slate-700 text-xs mt-1">Payment: <span className="font-medium">{item.payment_mode || '—'}</span></p>
                      {item.payment_mode === 'emi' && (
                        <div className="text-xs text-slate-600 mt-1">
                          <p>EMI Provider: {item.emi_provider || '—'}</p>
                          <p>Tenure: {item.emi_tenure_months || 0} months</p>
                          <p>Down Payment: ₹{Number(item.emi_down_payment || 0).toLocaleString('en-IN')}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">₹{Number(item.selling_price || 0).toLocaleString('en-IN')}</p>
                      <p className="text-xs text-slate-500 mt-1">Purchase: ₹{Number(item.purchase_price || 0).toLocaleString('en-IN')}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
