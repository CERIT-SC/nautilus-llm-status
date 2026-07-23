import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * UI state interface
 */
interface UIState {
  theme: 'light' | 'dark' | 'system';
  refreshInterval: string;
}

/**
 * UI actions interface
 */
interface UIActions {
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setRefreshInterval: (interval: string) => void;
}

const DEFAULT_STATE: UIState = {
  theme: 'system',
  refreshInterval: '300',
};

/**
 * Zustand store for UI preferences with localStorage persistence
 */
export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setTheme: (theme) => set({ theme }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
    }),
    {
      name: 'ui-store',
      storage: createJSONStorage(() => localStorage),
      // Client-side only app - no SSR hydration needed
    },
  ),
);
