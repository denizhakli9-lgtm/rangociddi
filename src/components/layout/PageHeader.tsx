import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="font-display text-3xl text-white sm:text-4xl">{title}</h1>
        {text && <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist-2">{text}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}
