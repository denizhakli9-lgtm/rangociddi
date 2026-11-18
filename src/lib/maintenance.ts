import { isNative } from '@/lib/platform';

/**
 * Bakım modu.
 *
 * `true` iken web sitesi (rango.com.tr) her sayfada bakım ekranını gösterir.
 * Yalnızca yasal metinler (/yasal/...) açık kalır; mağaza incelemeleri ve
 * KVKK bağlantıları bu sayfalara ihtiyaç duyar.
 *
 * Siteyi yeniden açmak için bu değeri `false` yapıp yayınlayın.
 */
export const MAINTENANCE_ENABLED = true;

/** Mobil uygulama bakım modundan etkilenmez; yalnızca web sitesi kapanır. */
export const maintenanceActive = MAINTENANCE_ENABLED && !isNative;
