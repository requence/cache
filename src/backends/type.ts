import type { ContextResult } from '../cacheContext.ts'

export type BackendCollectionResult = Promise<Awaited<ContextResult> | null>

/**
 * An invalidation made by another process that shares the same backend.
 */
export type RemoteInvalidation =
  | { type: 'args'; key: string; args: string }
  | { type: 'key'; key: string }
  | { type: 'tag'; tag: string }
  | { type: 'reset' }

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
  /**
   * Shared backends only: reports invalidations made by OTHER processes, so
   * each process can drop the same entries from its own memory layer.
   */
  onRemoteInvalidation?(
    listener: (invalidation: RemoteInvalidation) => void,
  ): void
}

export interface CacheBackendOptions {
  ttl: number
  size: number
}
