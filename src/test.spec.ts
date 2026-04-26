import { setTimeout } from 'node:timers/promises'

import { expect, it } from 'bun:test'

import { MemoryBackend } from './backends/MemoryBackend.ts'
import {
  addCacheTag,
  createCache,
  dontCache,
  resetAllCaches,
  withCachingDisabled,
} from './index.ts'

it('stores and retrieves values', () => {
  const cache = createCache().define('add1', async (base: number) => base + 1)
  expect(cache.add1(10)).resolves.toBe(11)
})

it('caches results', () => {
  let called = 0
  const cache = createCache().define('add1', async (base: number) => {
    called += 1
    return base + 1
  })
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(11)).resolves.toBe(12)
  expect(called).toBe(2)
})

it('invalidates all', () => {
  let called = 0
  const cache = createCache().define('add1', async (base: number) => {
    called += 1
    return base + 1
  })
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(10)).resolves.toBe(11)
  cache.invalidateAll('add1')
  expect(cache.add1(10)).resolves.toBe(11)
  expect(called).toBe(2)
})

it('invalidates by argument', () => {
  let called = 0
  const cache = createCache().define('add1', async (base: number) => {
    called += 1
    return base + 1
  })
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(11)).resolves.toBe(12)
  expect(called).toBe(2)
  cache.invalidate('add1', 10)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(11)).resolves.toBe(12)
  expect(called).toBe(3)
})

it('invalides by cache tag', () => {
  let called = 0
  const cache = createCache()
    .define('add1', async (base: number) => {
      called += 1
      addCacheTag('addNumber')
      return base + 1
    })
    .define('add2', async (base: number) => {
      called += 1
      addCacheTag('addNumber')
      return base + 2
    })
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add2(10)).resolves.toBe(12)
  cache.invalidateTag('addNumber')
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add2(10)).resolves.toBe(12)
  expect(called).toBe(4)
})

it('respects max size', () => {
  let called = 0
  const cache = createCache({ memorySize: 3 }).define(
    'add1',
    async (base: number) => {
      called += 1
      return base + 1
    },
  )
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(11)).resolves.toBe(12)
  expect(cache.add1(12)).resolves.toBe(13)
  expect(cache.add1(13)).resolves.toBe(14)
  expect(called).toBe(4)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(called).toBe(5)
})

it('respects ttl', async () => {
  let called = 0
  const cache = createCache({ memoryTTL: 10 }).define(
    'add1',
    async (base: number) => {
      called += 1
      return base + 1
    },
  )
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(called).toBe(1)
  await setTimeout(20)
  expect(cache.add1(10)).resolves.toBe(11)
  expect(called).toBe(2)
})

it('prevents tag pollution', async () => {
  const backend = new MemoryBackend({ size: 0, ttl: 0 })
  const cache = createCache({ backend }).define(
    'add1',
    async (base: number) => {
      await setTimeout(10)
      addCacheTag('addNumber')
      return base + 1
    },
  )

  await cache.add1(10)
  expect(backend.tags.has('addNumber')).toBeTrue()
  await cache.invalidateTag('addNumber')
  expect(backend.tags.has('addNumber')).toBeFalse()

  cache.add1(10) // will generate 'addNumber' tag
  await cache.invalidateAll('add1') // invalidate before callback done

  expect(backend.tags.has('addNumber')).toBeFalse()

  const backend2 = new MemoryBackend({ size: 0, ttl: 10 })
  const cache2 = createCache({ backend: backend2 }).define(
    'add1',
    async (base: number) => {
      if (base === 10) {
        addCacheTag('test')
      }

      return base + 1
    },
  )

  await cache2.add1(10)
  expect(backend2.tags.has('test')).toBeTrue()
  await setTimeout(50)
  await cache2.add1(11)
  expect(backend2.tags.has('test')).toBeFalse()
})

it('uses scope', async () => {
  const backend = new MemoryBackend({ size: 10, ttl: 10 })
  let called = 0
  const cache = createCache({ backend }).define('test', async () => {
    called += 1
    return Math.random()
  })

  const value1 = await cache.test()
  const value2 = await cache.withScope('my-branch').test()

  expect(called).toBe(2)
  expect(value1).not.toBe(value2)

  await cache.invalidateAll('test')

  const value3 = await cache.test()
  const value4 = await cache.withScope('my-branch').test()

  expect(backend.tags.has('__SCOPE__:my-branch')).toBeTrue()
  expect(backend.tags.has('__SCOPE__:__GLOBAL__')).toBeTrue()

  expect(called).toBe(3)
  expect(value1).not.toBe(value3)
  expect(value2).toBe(value4)

  await cache.withScope('my-branch').invalidateAll('test')

  const value5 = await cache.test()
  const value6 = await cache.withScope('my-branch').test()

  expect(called).toBe(4)
  expect(value3).toBe(value5)
  expect(value4).not.toBe(value6)

  expect(backend.tags.size).toBe(2)
  await cache.withScope('my-branch').clear()
  expect(backend.tags.size).toBe(1)
})

it('uses default scope', async () => {
  const backend = new MemoryBackend({ size: 10, ttl: 10 })
  const cache = createCache({
    backend,
    defaultScope: 'DEFAULT',
  }).define('test', async () => 'abc')

  await cache.test()

  await cache.withScope('NOT_DEFAULT').test()
  expect(backend.tags.has('__SCOPE__:DEFAULT')).toBeTrue()
  expect(backend.tags.has('__SCOPE__:NOT_DEFAULT')).toBeTrue()
})

it('uses default scope function', async () => {
  const backend = new MemoryBackend({ size: 10, ttl: 10 })
  let scope: string | null = 'A'
  const cache = createCache({
    backend,
    defaultScope: () => (scope ? `KEY_${scope}` : null),
  }).define('test', async () => 'abc')

  await cache.test()
  scope = 'B'
  await cache.test()
  scope = null
  await cache.test()

  expect(backend.tags.has('__SCOPE__:KEY_A')).toBeTrue()
  expect(backend.tags.has('__SCOPE__:KEY_B')).toBeTrue()
  expect(backend.tags.has('__SCOPE__:__GLOBAL__')).toBeTrue()
})

it('can access own scope', async () => {
  const cache = createCache().define('test', async function () {
    return this.scope
  })

  const result = await cache.withScope('my-scope').test()
  expect(result).toBe('my-scope')
})

it('calls itself', async () => {
  const cache = createCache()
    .define('base', async (num: number) => num * 2)
    .define('other', async function (num: number) {
      return this.base(num + 1)
    })

  const result = await cache.other(10)
  expect(result).toBe(22)
})

it('cascade invalidates', async () => {
  let called = 0
  const cache = createCache()
    .define('base', async (num: number) => {
      called += 1
      addCacheTag('a')
      return num * 2
    })
    .define('other', async function (num: number) {
      return this.base(num + 1)
    })

  const reset = () => {
    called = 0
    return cache.reset()
  }

  await cache.other(10)
  await cache.invalidateTag('a')
  await cache.other(10)

  expect(called).toBe(2)

  await reset()
  await cache.base(11)
  await cache.other(10)
  await cache.invalidateTag('a')
  await cache.other(10)

  expect(called).toBe(2)

  await reset()
  await cache.other(10)
  await cache.invalidate('base', 11)
  await cache.other(10)

  expect(called).toBe(2)

  await reset()
  await cache.other(10)
  await cache.invalidateAll('base')
  await cache.other(10)

  expect(called).toBe(2)
})

it('postprocesses function return values', async () => {
  let fnCalled = 0
  let processorCalled = 0

  const cache = createCache().define(
    'generate',
    async (value: number) => {
      fnCalled++
      return value * 2
    },
    (pre) => {
      processorCalled++
      return String(pre) + '_processed'
    },
  )

  const result = await cache.generate(10)
  await cache.generate(10)
  expect(result).toBe('20_processed')
  expect(fnCalled).toBe(1)
  expect(processorCalled).toBe(2)
})

it('resets', async () => {
  const backend = new MemoryBackend({ size: 10, ttl: 10 })
  const cache = createCache({
    backend,
  }).define('test', async () => 'abc')

  await cache.test()
  await cache.withScope('a').test()
  await cache.withScope('b').test()

  expect(backend.tags.size).toBe(3)
  await cache.reset()
  expect(backend.tags.size).toBe(0)
})

it('resets all', async () => {
  let called = 0
  const cacheA = createCache().define('testA', async () => {
    called += 1
    return 'abc'
  })

  const cacheB = createCache().define('testB', async () => {
    called += 1
    return 'def'
  })

  await cacheA.testA()
  await cacheB.testB()
  expect(called).toBe(2)
  await resetAllCaches()
  await cacheA.testA()
  await cacheB.testB()
  expect(called).toBe(4)
})

it('deduplicates requests', async () => {
  let called = 0
  const cache = createCache().define('expensive', async () => {
    called += 1
    await setTimeout(100)
    return 10
  })

  const results = await Promise.all([cache.expensive(), cache.expensive()])

  expect(results).toEqual([10, 10])
  expect(called).toBe(1)
})

it('allows cache tag arrays', async () => {
  let called = 0
  const cache = createCache()
    .define('low', async (a: string, b: string) => {
      called += 1
      addCacheTag([a, b])
      return a.length + b.length
    })
    .define('high', async function (a: string, b: string) {
      return (await this.low(a, b)) * 2
    })

  expect(cache.high('abc', 'defg')).resolves.toBe(14)
  cache.invalidateTag(['abc', 'defg'])
  expect(cache.high('abc', 'defg')).resolves.toBe(14)
  expect(called).toBe(2)
})

it('resolves cache invalidation race conditions', async () => {
  const values = ['abc', 'def']

  // retrieve taskes >100ms
  const cache = createCache().define('retrieve', async () => {
    addCacheTag(['a', 'b', 'c'])
    await setTimeout(100)
    return values.pop()
  })

  const retrievedA = cache.retrieve()
  // invalidate while retrieve is executing
  cache.invalidateTag(['a', 'b', 'c'])
  // retretrieve still returns the fresh result
  expect(await retrievedA).toBe('abc')
})

it('disables caching', async () => {
  const backend = new MemoryBackend({ size: 1000, ttl: 0 })
  const cache = createCache({ backend }).define(
    'add1',
    async (base: number) => {
      await setTimeout(10)
      return base + 1
    },
  )

  await withCachingDisabled(async () => {
    await cache.add1(10)
  })

  expect(backend.tags.size).toBe(0)
  expect(backend.data.size).toBe(0)
})

it('always executes function inside withCachingDisabled even with cached value', async () => {
  let called = 0
  const cache = createCache().define('add1', async (base: number) => {
    called += 1
    return base + 1
  })

  // populate the cache
  await cache.add1(10)
  expect(called).toBe(1)

  // call again without disabling – should serve from cache
  await cache.add1(10)
  expect(called).toBe(1)

  // call inside withCachingDisabled – function must execute again
  const result = await withCachingDisabled(() => cache.add1(10))
  expect(called).toBe(2)
  expect(result).toBe(11)
})

it('can catch errors thrown in function', async () => {
  const error = new Error('stop')
  const cache = createCache()
    .define('get', async (base: number) => {
      if (base === 0) {
        throw error
      }

      return base
    })
    .define('getUpper', async function () {
      return this.get(0)
    })

  try {
    await cache.get(0)
    expect.unreachable()
  } catch (caughtError) {
    expect(caughtError).toBe(error)
  }

  try {
    await cache.getUpper()
    expect.unreachable()
  } catch (caughtError) {
    expect(caughtError).toBe(error)
  }
})

it('can disable cache in function', async () => {
  let called = 0
  const cache = createCache().define('get', async (base: number) => {
    if (base === 20) {
      dontCache()
    }
    called += 1
    return base + 1
  })

  await cache.get(10)
  await cache.get(10)
  expect(called).toBe(1)

  await cache.get(20)
  await cache.get(20)
  expect(called).toBe(3)
})

it('can disable cache in deep function', async () => {
  let called = 0
  const cache = createCache()
    .define('get', async (base: number) => {
      if (base === 20) {
        dontCache()
      }
      return base + 1
    })
    .define('upper', async function (num: number) {
      called += 1
      return this.get(num * 2)
    })

  await cache.upper(5)
  await cache.upper(5)
  expect(called).toBe(1)

  await cache.upper(10)
  await cache.upper(10)
  expect(called).toBe(3)
})
