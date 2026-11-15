// Types for the plain-JS Classic adapter (moon-hd/classic-adapter.js), consumed by app.ts.
export function createMoon(stage: HTMLElement, status: HTMLElement, opts?: { date?: string; onUnavailable?: () => void; signal?: AbortSignal }): Promise<{
  focus(lat: number, lon: number): void; setSites(sites: unknown[]): void; reset(): void; zoom(factor: number): void; setTime(date: string): void; dispose(): void;
}>;
