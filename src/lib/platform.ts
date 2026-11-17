import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';

/** True inside the Android / iOS app, false on the website. */
export const isNative = Capacitor.isNativePlatform();

/**
 * The public website. Inside the app `window.location.origin` is
 * `https://localhost` (Android) or `capacitor://localhost` (iOS), which must never
 * end up in e-mails or shared links, so those always point at the real site.
 */
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || 'https://rango.com.tr').replace(/\/+$/, '');

export function publicOrigin(): string {
  return isNative ? SITE_URL : window.location.origin;
}

/** Absolute public URL for an app path such as `/i/salon-adi`. */
export function publicUrl(path: string): string {
  return `${publicOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Opens a page "in a new tab". The app has no tabs, so there it opens in an
 * in-app browser sheet over the app, which keeps half-filled forms intact.
 * `pathOrUrl` may be an app path (`/yasal/...`) or a full https URL.
 */
export async function openExternal(pathOrUrl: string): Promise<void> {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : publicUrl(pathOrUrl);
  if (isNative) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Click handler for `<a target="_blank">` / `<Link target="_blank">`: on the
 * website the link behaves normally, in the app it opens via `openExternal`.
 */
export function newTabClick(pathOrUrl: string) {
  return (e: { preventDefault: () => void }) => {
    if (!isNative) return;
    e.preventDefault();
    void openExternal(pathOrUrl);
  };
}

/**
 * Click handler for links that should leave the app entirely (map apps): in the
 * app the WebView hands the URL to the system, which opens Google/Apple/Yandex
 * Maps directly; on the website the link behaves normally.
 */
export function systemLinkClick(url: string) {
  return (e: { preventDefault: () => void }) => {
    if (!isNative) return;
    e.preventDefault();
    window.location.href = url;
  };
}

/** Native share sheet in the app, Web Share API or clipboard on the website. Returns 'copied' when it fell back to the clipboard. */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied'> {
  if (isNative) {
    await Share.share({ title, url, dialogTitle: title });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ title, url });
    return 'shared';
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}

export type PositionError = 'unsupported' | 'denied' | 'unavailable';

/**
 * Current device position. In the app it uses the native location service (one
 * clear permission prompt); on the website the browser's geolocation.
 * Rejects with a `PositionError` string.
 */
export async function getDevicePosition(opts: { highAccuracy?: boolean; timeout?: number } = {}): Promise<{ latitude: number; longitude: number }> {
  const enableHighAccuracy = opts.highAccuracy ?? false;
  const timeout = opts.timeout ?? 10000;

  if (isNative) {
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        perm = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      }
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') throw 'denied' as PositionError;
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, timeout, maximumAge: 0 });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (err) {
      if (err === 'denied') throw err;
      const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
      throw (msg.includes('denied') || msg.includes('permission') ? 'denied' : 'unavailable') as PositionError;
    }
  }

  if (!('geolocation' in navigator)) throw 'unsupported' as PositionError;
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject((err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable') as PositionError),
      { enableHighAccuracy, timeout, maximumAge: 0 },
    );
  });
}
