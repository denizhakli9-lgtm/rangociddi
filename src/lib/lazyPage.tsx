import { lazy, type ComponentType } from 'react';

const preloadable: { pattern: RegExp; preload: () => Promise<void> }[] = [];

/**
 * A lazily loaded page whose code can also be fetched before its first render.
 *
 * The pages that are published as static HTML (seo/prerender.ts) use it: when such a page is
 * opened, `preloadRoute` fetches its code while the static page is still on screen, so the app
 * takes over in one step instead of showing a loading spinner in between. `pattern` is the
 * address the page is served at.
 */
export function lazyPage(load: () => Promise<{ default: ComponentType }>, pattern: RegExp) {
  let Loaded: ComponentType | null = null;
  const Lazy = lazy(load);
  preloadable.push({
    pattern,
    preload: () =>
      load().then((module) => {
        Loaded = module.default;
      }),
  });
  return function Page() {
    return Loaded ? <Loaded /> : <Lazy />;
  };
}

/** Loads the code of the page at `pathname` ahead of the first render (does nothing for other pages). */
export function preloadRoute(pathname: string): Promise<void> {
  return preloadable.find(({ pattern }) => pattern.test(pathname))?.preload() ?? Promise.resolve();
}
