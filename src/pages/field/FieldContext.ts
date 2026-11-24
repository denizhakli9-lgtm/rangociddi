import { createContext, useContext } from 'react';
import type { FieldAgentBusiness, FieldAgentMe } from '@/lib/fieldAgent';

export interface FieldValue {
  me: FieldAgentMe;
  businesses: FieldAgentBusiness[] | null;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
}

export const FieldContext = createContext<FieldValue | null>(null);

export function useField(): FieldValue {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error('useField must be used inside FieldArea');
  return ctx;
}
