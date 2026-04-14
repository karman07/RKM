import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Product {
  _id: string;
  name: string;
  sku: string;
  images: string[];
  net_weight: number;
  metal_type: string;
  purity: string;
  description?: string;
  pricing_breakdown?: {
    final_price: number;
  };
}

interface WishlistState {
  items: Product[];
}

const getInitialState = (): WishlistState => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('rkm_wishlist');
    return saved ? { items: JSON.parse(saved) } : { items: [] };
  }
  return { items: [] };
};

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState: getInitialState(),
  reducers: {
    toggleWishlist: (state, action: PayloadAction<Product>) => {
      const index = state.items.findIndex(item => item._id === action.payload._id);
      if (index >= 0) {
        state.items.splice(index, 1);
      } else {
        state.items.push(action.payload);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('rkm_wishlist', JSON.stringify(state.items));
      }
    },
    removeFromWishlist: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item._id !== action.payload);
      if (typeof window !== 'undefined') {
        localStorage.setItem('rkm_wishlist', JSON.stringify(state.items));
      }
    }
  }
});

export const { toggleWishlist, removeFromWishlist } = wishlistSlice.actions;
export default wishlistSlice.reducer;
