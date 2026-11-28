import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';

/** True inside the Android / iOS app, false on the website. */
export const isNative = Capacitor.isNativePlatform();

/** True only inside the iOS app (iPhone wording such as "Ayarlar > Rango", iOS-only flows). */
export const isIOS = Capacitor.getPlatform() === 'ios';

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

/**
 * Hands a file the app generated (data export, calendar file) to the user. The app's WebView cannot
 * download files (an `<a download>` does nothing there), so the file is written to the app's cache
 * and offered through the system share sheet ("Dosyalara Kaydet", Mail, AirDrop...).
 * App only; the website downloads the file itself. Resolves 'cancelled' when the sheet was closed
 * without choosing anything, so callers never report a save that did not happen.
 */
export async function shareGeneratedFile(filename: string, data: string, dialogTitle: string): Promise<'shared' | 'cancelled'> {
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle });
    return 'shared';
  } catch (err) {
    if (/cancel/i.test(String((err as { message?: string })?.message ?? err))) return 'cancelled';
    throw err;
  }
}

/** True where `openAppSettings` works: iOS opens the app's own page in Settings (Ayarlar > Rango). */
export const canOpenAppSettings = isIOS;

/** Opens Rango's page in the iOS Settings app (location permission etc.). The WebView hands the URL to iOS. */
export function openAppSettings() {
  if (canOpenAppSettings) window.location.href = 'app-settings:';
}

/** 'off': the phone's location services are switched off for every app (app only). */
export type PositionError = 'unsupported' | 'denied' | 'off' | 'unavailable';

/** Device position; `accuracy` is the radius in metres (large when only approximate location was allowed). */
export interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** Rejects with 'unavailable' when `promise` has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject('unavailable' as PositionError), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Current device position. In the app it uses the native location service (one
 * clear permission prompt); on the website the browser's geolocation.
 * Rejects with a `PositionError` string, and never hangs: the native permission
 * request only settles when iOS reports a decision, so every native step is time-boxed.
 */
export async function getDevicePosition(opts: { highAccuracy?: boolean; timeout?: number } = {}): Promise<DevicePosition> {
  const enableHighAccuracy = opts.highAccuracy ?? false;
  const timeout = opts.timeout ?? 10000;

  if (isNative) {
    try {
      let perm = await withTimeout(Geolocation.checkPermissions(), 5000);
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        // Long enough for the user to read the system prompt.
        perm = await withTimeout(Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] }), 60000);
      }
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') throw 'denied' as PositionError;
      const pos = await withTimeout(Geolocation.getCurrentPosition({ enableHighAccuracy, timeout, maximumAge: 0 }), timeout + 5000);
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
    } catch (err) {
      if (err === 'denied' || err === 'unavailable') throw err;
      const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
      // Location switched off for the whole phone ("Location services are not enabled.", Android's
      // "...Network and Location turned off." or a refused "turn on location" dialog).
      if (msg.includes('not enabled') || msg.includes('turned off') || msg.includes('enable location')) throw 'off' as PositionError;
      throw (msg.includes('denied') || msg.includes('permission') || msg.includes('restricted') ? 'denied' : 'unavailable') as PositionError;
    }
  }

  if (!('geolocation' in navigator)) throw 'unsupported' as PositionError;
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject((err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable') as PositionError),
      { enableHighAccuracy, timeout, maximumAge: 0 },
    );
  });
}
