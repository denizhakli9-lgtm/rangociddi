import { createContext, useContext } from 'react';
import type { Business } from '@/lib/types';

interface OwnerValue {
  business: Business;
  reload: () => Promise<void>;
}

export const OwnerContext = createContext<OwnerValue | null>(null);

export function useOwnerBusiness(): OwnerValue {
  const ctx = useContext(OwnerContext);
  if (!ctx) throw new Error('useOwnerBusiness must be used inside OwnerArea');
  return ctx;
}
