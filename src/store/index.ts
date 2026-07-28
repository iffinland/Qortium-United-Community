// ===== Redux Store – Root Configuration =====

import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from './slices/authSlice';
import fundReducer from './slices/fundSlice';
import { qortiumApi } from './api/qortiumApi';
import { forumApi } from './api/forumApi';
import { supportApi } from './api/supportApi';
import { wikiApi } from './api/wikiApi';
import { pollApi } from './api/pollApi';
import { projectApi } from './api/projectApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    fund: fundReducer,
    [qortiumApi.reducerPath]: qortiumApi.reducer,
    [forumApi.reducerPath]: forumApi.reducer,
    [supportApi.reducerPath]: supportApi.reducer,
    [wikiApi.reducerPath]: wikiApi.reducer,
    [pollApi.reducerPath]: pollApi.reducer,
    [projectApi.reducerPath]: projectApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      qortiumApi.middleware,
      forumApi.middleware,
      supportApi.middleware,
      wikiApi.middleware,
      pollApi.middleware,
      projectApi.middleware,
    ),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
