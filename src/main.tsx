import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, TooltipManager } from 'fluxo-ui';
import 'fluxo-ui/styles';

import './styles/global.scss';
import App from './App';
import { BackendProvider } from './backend/context';
import { ToastProvider } from './lib/toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BackendProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BackendProvider>
      <TooltipManager />
    </ThemeProvider>
  </StrictMode>,
);
