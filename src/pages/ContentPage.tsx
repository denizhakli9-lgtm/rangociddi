import { Blocks } from '@/components/seo/Blocks';
import type { PageModel } from '@/lib/seo/blocks';
import type { SeoLang } from '@/lib/seo/meta';
import { useSeo } from '@/lib/seo/useSeo';
import { locale } from '@/i18n/locale';

/**
 * A page that is fully described by its content model (FAQ, "for businesses"): the same model
 * gives the page its text, title, description and structured data, and is rendered to static
 * HTML at build time (seo/prerender.ts).
 */
export function ContentPage({ page }: { page: (lang: SeoLang) => PageModel }) {
  const model = page(locale());
  useSeo(model.meta);
  return <Blocks blocks={model.blocks} />;
}
