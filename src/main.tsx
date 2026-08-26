import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import './index.css';
import App from './App';
import {
  applyHomeTextSize,
  readHomeTextSizeFromUrl,
} from './services/qortium/homeTextSize';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

// Home text size must be available before the first React render so rem-based
// typography starts at the correct scale without a flash of medium/16px.
const initialHomeTextSize = readHomeTextSizeFromUrl(window.location.search);
applyHomeTextSize(initialHomeTextSize.value, document.documentElement);

createRoot(rootElement).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);
