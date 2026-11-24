import { homePathFor, useAuth } from '@/contexts/AuthContext';
import { isNative } from '@/lib/platform';

/**
 * Where "home" links (logo, Keşfet tab, the first breadcrumb item) point.
 *
 * On the website the home page lives at "/", the address search engines index. Two cases keep
 * the in-app address "/kesfet":
 *  - the mobile app, where "/" is the splash screen;
 *  - business owners and admins, for whom opening "/" means "go to my panel" (see WebHome in
 *    App.tsx) and who should stay on the customer pages they are browsing.
 */
export function useHomePath(): string {
  const { profile } = useAuth();
  return isNative || (profile && homePathFor(profile) !== '/kesfet') ? '/kesfet' : '/';
}
