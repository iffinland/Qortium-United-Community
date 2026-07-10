// ===== Redux Store – Auth Slice =====

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { getUserAccount, getAccountNames, getAccountBalance } from '../../services/qortium/walletService';
import { fetchRoleRegistry, getUserRole } from '../../services/qortium/rolesService';
import { isQortiumBridgeAvailable } from '../../services/qortium/qortiumClient';
import type { UserRole } from '../../types';

interface AuthState {
  address: string | null;
  name: string | null;
  names: string[];
  role: UserRole;
  balance: number | null;
  isBridgeAvailable: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  address: null,
  name: null,
  names: [],
  role: 'Member',
  balance: null,
  isBridgeAvailable: false,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    try {
      const bridgeAvailable = isQortiumBridgeAvailable();
      if (!bridgeAvailable) {
        // In development, return mock user
        if (import.meta.env.DEV) {
          return {
            address: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
            name: 'Qortian',
            names: ['Qortian'],
            role: 'SysOp' as UserRole,
            balance: 12500.75,
            bridgeAvailable: false,
          };
        }
        return rejectWithValue('Qortium bridge not available. Open in Qortium Home.');
      }

      const account = await getUserAccount();
      const names = account.address
        ? await getAccountNames(account.address)
        : [];
      const registry = await fetchRoleRegistry();
      const role = getUserRole(account.address, registry);
      const balance = account.address
        ? await getAccountBalance(account.address)
        : null;

      return {
        address: account.address,
        name: account.name || names[0] || null,
        names,
        role,
        balance,
        bridgeAvailable: true,
      };
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Authentication failed.'
      );
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuth: () => initialState,
    setBalance: (state, action: PayloadAction<number>) => {
      state.balance = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.address = action.payload.address;
        state.name = action.payload.name;
        state.names = action.payload.names;
        state.role = action.payload.role;
        state.balance = action.payload.balance;
        state.isBridgeAvailable = action.payload.bridgeAvailable;
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearAuth, setBalance } = authSlice.actions;
export default authSlice.reducer;
