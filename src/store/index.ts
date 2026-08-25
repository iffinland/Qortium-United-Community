// ===== Redux Store – Root Configuration =====

import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from './slices/authSlice';
import { qortiumApi } from './api/qortiumApi';
import { fundApi } from './api/fundApi';
import { forumApi } from './api/forumApi';
import { supportApi } from './api/supportApi';
import { wikiApi } from './api/wikiApi';
import { pollApi } from './api/pollApi';
import { projectApi } from './api/projectApi';
import { roleApi } from './api/roleApi';
import { eventApi } from './api/eventApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [qortiumApi.reducerPath]: qortiumApi.reducer,
    [fundApi.reducerPath]: fundApi.reducer,
    [forumApi.reducerPath]: forumApi.reducer,
    [supportApi.reducerPath]: supportApi.reducer,
    [wikiApi.reducerPath]: wikiApi.reducer,
    [pollApi.reducerPath]: pollApi.reducer,
    [projectApi.reducerPath]: projectApi.reducer,
    [roleApi.reducerPath]: roleApi.reducer,
    [eventApi.reducerPath]: eventApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      qortiumApi.middleware,
      forumApi.middleware,
      supportApi.middleware,
      wikiApi.middleware,
      pollApi.middleware,
      projectApi.middleware,
      roleApi.middleware,
      eventApi.middleware,
      fundApi.middleware,
    ),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
