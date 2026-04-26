import type { ContextResult } from '../cacheContext.ts'

export type BackendCollectionResult = Promise<Awaited<ContextResult> | null>

export interface CacheBackend {
  get(key: string, args: string): Promise<any>
  getTags(key: string, args: string): Promise<string[]>
  set(
    key: string,
    args: string,
    collectionResult: BackendCollectionResult,
  ): Promise<void>
  invalidateArgs(key: string, args: string): Promise<void>
  invalidateKey(key: string): Promise<void>
  invalidateTag(tag: string): Promise<void>
  reset(): Promise<void>
}

export interface CacheBackendOptions {
  ttl: number
  size: number
}
