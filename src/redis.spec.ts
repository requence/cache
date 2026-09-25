import { setTimeout } from 'node:timers/promises'

import { expect, it } from 'bun:test'

import createRedisBackend from './backends/RedisBackend.ts'
import { addCacheTag, createCache } from './index.ts'

// Needs a real Redis: run with REDIS_URL=redis://localhost:6379 bun test
const redisUrl = process.env.REDIS_URL

/**
 * Two caches over the same Redis prefix, like two processes of one app. The
 * duplicate-backend guard is keyed by the url string, so the second instance
 * reaches the same server through a url that differs only by a query string.
 */
function createInstances(compute: (id: number) => string) {
  const prefix = `cache-test-${crypto.randomUUID()}`
  return ['', '?instance=2'].map((suffix) =>
    createCache({
      backend: createRedisBackend({ url: `${redisUrl}${suffix}`, prefix }),
    }).define('get', async (id: number) => {
      addCacheTag(`item:${id}`)
      return compute(id)
    }),
  )
}

/** Pub/sub is asynchronous: wait until the other instance sees the change. */
async function eventually(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await check()) {
      return true
    }
    await setTimeout(20)
  }
  return false
}

it.skipIf(!redisUrl)(
  'clears the memory layer of other instances on invalidateTag',
  async () => {
    let version = 1
    const [first, second] = createInstances((id) => `${id}@v${version}`)

    // The second instance computes the value, so it holds it in memory.
    expect(await second.get(1)).toBe('1@v1')
    expect(await first.get(1)).toBe('1@v1')

    version = 2
    await first.invalidateTag('item:1')

    expect(await eventually(async () => (await second.get(1)) === '1@v2')).toBe(
      true,
    )
  },
)

it.skipIf(!redisUrl)(
  'clears the memory layer of other instances on invalidate',
  async () => {
    let version = 1
    const [first, second] = createInstances((id) => `${id}@v${version}`)

    expect(await second.get(1)).toBe('1@v1')

    version = 2
    await first.invalidate('get', 1)

    expect(await eventually(async () => (await second.get(1)) === '1@v2')).toBe(
      true,
    )
  },
)
