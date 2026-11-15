// Types for the plain-JS media client (kept in JS; no generated sibling).
import type { ApiResult } from "./data.js";
export interface MediaCard { title: string; credit: string; page_url: string; illustrative_only: true; }
export function validateMedia(data: unknown, siteId: string): MediaCard[] | null;
export function createMediaLoader(api: <T = unknown>(path: string) => Promise<ApiResult<T>>): (siteId: string) => Promise<MediaCard[] | null>;
