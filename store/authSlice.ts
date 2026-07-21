import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ShippingAddress {
  attention?: string;
  address?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

interface Customer {
  _id: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  address: string;
  city: string;
  state: string;
  pincode?: string;
  country: string;
  profileImage?: string;
  isEmailVerified?: boolean;
  relationship_manager?: { _id: string; name: string; email?: string; mobile_number?: string; role?: string } | string | null;
  customFields?: { key: string; value: string }[];
  // Editable via the storefront profile page
  work_phone?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  customer_sub_type?: 'business' | 'individual';
  website?: string;
  attention?: string;
  street2?: string;
  shipping_address?: ShippingAddress | null;
}

interface AuthState {
  token: string | null;
  customer: Customer | null;
  isAuthDialogOpen: boolean;
}

const getInitialState = (): AuthState => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rkm_customer_token');
    const customer = localStorage.getItem('rkm_customer');
    return {
      token: token || null,
      customer: customer ? JSON.parse(customer) : null,
      isAuthDialogOpen: false,
    };
  }
  return { token: null, customer: null, isAuthDialogOpen: false };
};

const authSlice = createSlice({
  name: 'auth',
  initialState: getInitialState(),
  reducers: {
    setAuth: (state, action: PayloadAction<{ token: string; customer: Customer }>) => {
      state.token = action.payload.token;
      state.customer = action.payload.customer;
      if (typeof window !== 'undefined') {
        localStorage.setItem('rkm_customer_token', action.payload.token);
        localStorage.setItem('rkm_customer', JSON.stringify(action.payload.customer));
      }
    },
    logout: (state) => {
      state.token = null;
      state.customer = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('rkm_customer_token');
        localStorage.removeItem('rkm_customer');
      }
    },
    openAuthDialog: (state) => {
      state.isAuthDialogOpen = true;
    },
    closeAuthDialog: (state) => {
      state.isAuthDialogOpen = false;
    }
  }
});

export const { setAuth, logout, openAuthDialog, closeAuthDialog } = authSlice.actions;
export default authSlice.reducer;
