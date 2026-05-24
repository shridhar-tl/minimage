import { createContext, useContext, type ReactNode } from 'react';

import { tauriBackend } from './tauri';
import type { ProcessorBackend } from './types';

// Swap the value here to change backends (e.g. an Electron implementation).
const BackendContext = createContext<ProcessorBackend>(tauriBackend);

export function BackendProvider({ children }: { children: ReactNode }) {
  return <BackendContext.Provider value={tauriBackend}>{children}</BackendContext.Provider>;
}

export function useBackend(): ProcessorBackend {
  return useContext(BackendContext);
}
