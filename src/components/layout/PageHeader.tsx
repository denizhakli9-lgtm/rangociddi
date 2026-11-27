import type { ReactNode } from 'react';

/**
 * Sayfa başlığı. `eyebrow` eski çağrılarla uyum için kabul edilir ama gösterilmez: hangi alanda
 * olunduğunu zaten gezinme çubuğu söyler.
 */
export function PageHeader({ title, text, action }: { eyebrow?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {text && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-mist-2">{text}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}
