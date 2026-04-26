import { AsyncLocalStorage } from 'node:async_hooks'

const cacheContext = new AsyncLocalStorage<{
  tags: Set<string>
  shouldCache: boolean
}>()

export type Tag = string | number | Array<string | number>
export function sanitzeCacheTag(tag: Tag) {
  const tags = Array.isArray(tag) ? tag : [tag]
  return tags.toSorted().map(String).join('/')
}

export function addCacheTag(tag: Tag) {
  const store = cacheContext.getStore()
  if (!store) {
    throw new Error(
      'addCacheTag can only be called inside a defined cache functions',
    )
  }

  store.tags.add(sanitzeCacheTag(tag))
}

export function dontCache() {
  const store = cacheContext.getStore()
  if (!store) {
    throw new Error(
      'dontCache can only be called inside a defined cache functions',
    )
  }

  store.shouldCache = false
}

export function isInsideExecution() {
  return Boolean(cacheContext.getStore())
}

export async function runContext<T extends (...args: any[]) => any>(
  handler: T,
) {
  const tags = new Set<string>()
  const context = { tags, shouldCache: true }
  const result = await cacheContext.run(context, handler)
  return {
    ...context,
    result,
  }
}

export type ContextResult = ReturnType<typeof runContext>
