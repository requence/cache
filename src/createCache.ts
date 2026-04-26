import { AsyncLocalStorage } from 'node:async_hooks'

import CombinedBackend from './backends/CombinedBackend.ts'
import { MemoryBackend } from './backends/MemoryBackend.ts'
import type { BackendCollectionResult, CacheBackend } from './backends/type.ts'
import {
  type ContextResult,
  type Tag,
  isInsideExecution,
  runContext,
  sanitzeCacheTag,
} from './cacheContext.ts'
import hashArgs from './hashArgs.ts'

function scopeTag(scope: string) {
  return `__SCOPE__:${scope}`
}

function keyTag(key: string) {
  return `__KEY__:${key}`
}

function keyWithArgsTag(key: string, args: string) {
  return `__KEY_WITH_ARGS__:${key}:${args}`
}

const invocationStore = new AsyncLocalStorage<
  (
    key: string,
    args: string,
    shouldCache: Promise<boolean>,
    tags: Promise<string[]>,
  ) => void
>()

const disabledStore = new AsyncLocalStorage<boolean>()

let imperativeDisabledCount = 0

function isDisabled() {
  return (disabledStore.getStore() ?? false) || imperativeDisabledCount > 0
}

function collectionDownstreamCacheData<T extends () => ContextResult>(
  handler: T,
) {
  const additionalTags: Array<string[] | Promise<string[]>> = []
  let shouldCache = Promise.resolve(true)
  const collectionResult = invocationStore.run((key, args, cache, tags) => {
    additionalTags.push([keyTag(key), keyWithArgsTag(key, args)], tags)
    shouldCache = cache
  }, handler)

  return {
    collectionResult,
    shouldCache: collectionResult.then(() => shouldCache).catch(() => true),
    additionalTags: collectionResult
      .then(() => Promise.all(additionalTags))
      .then((tags) => new Set(tags.flat()))
      .catch(() => null),
  }
}

function isDownstreamInvocation() {
  return typeof invocationStore.getStore() !== 'undefined'
}

function propagateCacheEntryData(
  key: string,
  args: string,
  shouldCache: Promise<boolean>,
  tags: Promise<string[]>,
) {
  invocationStore.getStore()?.(key, args, shouldCache, tags)
}

type AnyFn = (...args: any[]) => any
type CacheRecord = Record<string, AnyFn>

function buildScope(cacheKey: string, baseKey: string) {
  return `${cacheKey}:${baseKey}`
}
type CachableFn<FN> = (this: FN & Scope, ...args: any[]) => Promise<any>

type Scope = { scope: string }

type Cache<FN extends CacheRecord = {}> = {
  define: {
    <
      K extends Exclude<
        string,
        | 'define'
        | 'invalidate'
        | 'invalidateTag'
        | 'invalidateAll'
        | 'withScope'
        | 'reset'
        | 'clear'
      >,
      F extends CachableFn<FN>,
    >(
      key: K,
      fn: F,
    ): Cache<FN & { [U in K]: OmitThisParameter<F> }>

    <
      K extends Exclude<
        string,
        | 'define'
        | 'invalidate'
        | 'invalidateTag'
        | 'invalidateAll'
        | 'withScope'
        | 'reset'
        | 'clear'
      >,
      F extends CachableFn<FN>,
      P,
    >(
      key: K,
      fn: F,
      process: (returnValue: Awaited<ReturnType<F>>) => P,
    ): Cache<FN & { [U in K]: (...args: Parameters<F>) => Promise<P> }>
  }
  withScope(scope: string): Omit<Cache<FN>, 'define'>
  clear(): Promise<void>
  reset(): Promise<void>
  invalidate<K extends keyof FN>(
    key: K,
    ...arg: Parameters<FN[K]>
  ): Promise<void>
  invalidateAll<K extends keyof FN>(...keys: K[]): Promise<void>
  invalidateTag(...tag: Array<Tag>): Promise<void>
} & FN

interface CacheOptions {
  /**
   * max time (in ms) that a result will be held in memory, defaults to 0 (infinite)
   */
  memoryTTL?: number
  /**
   * max number of results per function that will be held in memory, defaults to 0 (infinite)
   */
  memorySize?: number

  backend?: CacheBackend | CacheBackend[]

  /**
   * default key to group items
   */
  defaultScope?: string | null | (() => string | null | void)
}

function assertString(key: string | number | symbol): asserts key is string {
  if (typeof key !== 'string') {
    throw new Error(`invalid key of type ${typeof key}`)
  }
}

const knownBackends = new Set<CacheBackend>()

export function createCache(options: CacheOptions = {}) {
  const cacheFns = new Map<string, AnyFn>()
  const postProcessorFns = new Map<string, AnyFn>()
  const pendingCalls = new Map<
    string,
    {
      promise: Promise<void>
      invalidatedTags: Set<string>
    }
  >()

  const getDefaultScope = () => {
    const defaultScope =
      typeof options.defaultScope === 'function'
        ? options.defaultScope()
        : options.defaultScope
    return defaultScope ?? '__GLOBAL__'
  }
  const memoryBackend = new MemoryBackend({
    ttl: options.memoryTTL ?? 0,
    size: options.memorySize ?? 0,
  })

  const backend = options.backend
    ? new CombinedBackend(
        Array.isArray(options.backend)
          ? [memoryBackend, ...options.backend]
          : [memoryBackend, options.backend],
      )
    : memoryBackend

  knownBackends.add(backend)

  const buildCache = (getScopeKey = getDefaultScope) => {
    const cache = new Proxy(
      {},
      {
        get(_target, property) {
          switch (property) {
            case 'define': {
              return (key: string, fn: AnyFn, postProcessor?: AnyFn) => {
                cacheFns.set(key, fn)
                if (postProcessor) {
                  postProcessorFns.set(key, postProcessor)
                }
                return buildCache()
              }
            }
            case 'invalidate': {
              return async (key: string, ...args: any[]) => {
                assertString(key)
                const scopedKey = buildScope(getScopeKey(), key)
                const hashedArgs = hashArgs(args)
                await backend.invalidateArgs(scopedKey, hashedArgs)

                const tag = keyWithArgsTag(scopedKey, hashedArgs)
                pendingCalls.values().forEach((v) => v.invalidatedTags.add(tag))

                await backend.invalidateTag(tag)
              }
            }
            case 'clear': {
              return async () => {
                const tag = scopeTag(getScopeKey())
                pendingCalls.values().forEach((v) => v.invalidatedTags.add(tag))
                await backend.invalidateTag(tag)
              }
            }
            case 'invalidateAll': {
              return async (...keys: string[]) => {
                await Promise.all(
                  keys.flatMap((key) => {
                    assertString(key)
                    const scopedKey = buildScope(getScopeKey(), key)
                    const tag = keyTag(scopedKey)
                    pendingCalls
                      .values()
                      .forEach((v) => v.invalidatedTags.add(tag))

                    return [
                      backend.invalidateKey(scopedKey),
                      backend.invalidateTag(tag),
                    ]
                  }),
                )
              }
            }
            case 'invalidateTag': {
              return async (...tags: Array<Tag>) => {
                await Promise.all(
                  tags.map((tag) => {
                    const sanitizedTag = sanitzeCacheTag(tag)
                    pendingCalls
                      .values()
                      .forEach((v) => v.invalidatedTags.add(sanitizedTag))
                    backend.invalidateTag(sanitizedTag)
                  }),
                )
              }
            }
            case 'withScope': {
              return (scope: string) => buildCache(() => scope)
            }
            case 'reset': {
              return () => backend.reset()
            }
            default: {
              if (property === 'scope' && isInsideExecution()) {
                return getScopeKey()
              }

              if (typeof property !== 'string' || !cacheFns.has(property)) {
                throw new Error(`unknown function ${String(property)}`)
              }
              const key = buildScope(getScopeKey(), property)
              const fn = cacheFns.get(property)!
              const execFn = async (...args: any[]) => {
                const hashedArgs = hashArgs(args)

                const pendingCallKey = `${key}-${hashedArgs}`

                if (pendingCalls.has(pendingCallKey)) {
                  await pendingCalls.get(pendingCallKey)!.promise
                }
                const pending = Promise.withResolvers<void>()
                const invalidatedTags = new Set<string>()
                pendingCalls.set(pendingCallKey, {
                  promise: pending.promise,
                  invalidatedTags,
                })
                pending.promise.then(() => {
                  pendingCalls.delete(pendingCallKey)
                })

                if (!isDisabled()) {
                  try {
                    const cachedResult = await backend.get(key, hashedArgs)
                    if (typeof cachedResult !== 'undefined') {
                      if (isDownstreamInvocation()) {
                        propagateCacheEntryData(
                          key,
                          hashedArgs,
                          Promise.resolve(true),
                          backend.getTags(key, hashedArgs),
                        )
                      }

                      pending.resolve()
                      return postProcessorFns.has(property)
                        ? postProcessorFns.get(property)!(cachedResult)
                        : cachedResult
                    }
                  } catch {
                    //
                  }
                }

                const { collectionResult, additionalTags, shouldCache } =
                  collectionDownstreamCacheData(() =>
                    runContext(() => fn.apply(cache, args)),
                  )

                const combinedResult: BackendCollectionResult =
                  collectionResult.then(async (result) => {
                    result.tags.add(scopeTag(getScopeKey()))

                    const aTags = await additionalTags

                    aTags?.forEach((tag) => {
                      result.tags.add(tag)
                    })

                    if (!(await shouldCache)) {
                      result.shouldCache = false
                    }

                    if (result.tags.intersection(invalidatedTags).size > 0) {
                      return null
                    }

                    return result
                  })

                propagateCacheEntryData(
                  key,
                  hashedArgs,
                  combinedResult
                    .then((r) => r?.shouldCache ?? true)
                    .catch(() => true),
                  combinedResult
                    .then((r) => (r ? Array.from(r.tags) : []))
                    .catch(() => []),
                )

                if (!isDisabled()) {
                  await backend.set(
                    key,
                    hashedArgs,
                    combinedResult.catch(() => null),
                  )
                }
                pending.resolve()

                const combined = await combinedResult
                if (!combined) {
                  return execFn(...args)
                }

                if (postProcessorFns.has(property)) {
                  return postProcessorFns.get(property)!(combined.result)
                }

                return combined.result
              }

              return execFn
            }
          }
        },
      },
    ) as Cache

    return cache
  }
  return buildCache()
}

export async function resetAllCaches() {
  for (const backend of knownBackends) {
    await backend.reset()
  }
}

export function withCachingDisabled<T extends () => any>(handler: T) {
  return disabledStore.run(true, handler) as ReturnType<T>
}

export function createCachingDisabledScope() {
  let active = false
  return {
    disable() {
      if (!active) {
        active = true
        imperativeDisabledCount++
      }
    },
    enable() {
      if (active) {
        active = false
        imperativeDisabledCount = Math.max(0, imperativeDisabledCount - 1)
      }
    },
  }
}

export type CachingDisableScope = ReturnType<typeof createCachingDisabledScope>
