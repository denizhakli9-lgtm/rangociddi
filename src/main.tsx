import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Heart } from 'lucide-react';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="flex min-h-screen items-center justify-center bg-ink px-6 py-12 text-center">
      <div className="w-full max-w-3xl">
        <p className="mb-8 text-sm font-semibold tracking-[0.24em] text-gold-400">RANGO · BAKIM</p>
        <h1 aria-label="Sude kalp Deniz" className="flex flex-wrap items-center justify-center gap-4 font-display text-5xl font-semibold leading-[1.2] text-white motion-safe:animate-pulse sm:gap-6 sm:text-7xl">
          <span>Sude</span>
          <Heart aria-hidden="true" className="h-12 w-12 shrink-0 fill-rose-500 text-rose-500 sm:h-16 sm:w-16" strokeWidth={1.5} />
          <span>Deniz</span>
        </h1>
        <p className="mt-8 text-sm leading-relaxed text-mist">Bakım devam ediyor. Yakında yeniden buradayız.</p>
      </div>
    </main>
  </StrictMode>
);
