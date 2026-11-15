// Types for the plain-JS metadata search widget.
export function mountVectorSearch(container: Element | null, opts?: { locale?: string; fetcher?: typeof fetch }): { setLocale(next: string): void };
