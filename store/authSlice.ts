import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Customer {
  _id: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  address: string;
  city: string;
  state: string;
  country: string;
  profileImage?: string;
  isEmailVerified?: boolean;
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
