# @requence/cache

Tag-based function caching with pluggable backends — memory, Redis, or both.

## Install

```bash
bun add @requence/cache
```

## Features

- **Fluent API** — define cached functions with `.define()` chaining
- **Tag-based invalidation** — invalidate groups of cached results by tag
- **Scoped caches** — isolate cache entries per tenant, branch, or any grouping
- **Pluggable backends** — in-memory (default), Redis, or combined multi-layer
- **Cascade invalidation** — nested cache calls propagate tags automatically
- **Request deduplication** — concurrent calls to the same function are coalesced
- **TTL & LRU eviction** — configurable time-to-live and max-size per function
- **Post-processing** — transform cached return values without re-executing

## Quick Start

```typescript
import { createCache, addCacheTag } from '@requence/cache'

const cache = createCache({ memoryTTL: 60_000 })
  .define('getUser', async (id: string) => {
    addCacheTag(['user', id])
    return db.users.findById(id)
  })
  .define('listUsers', async () => {
    addCacheTag('user')
    return db.users.findAll()
  })

// Cached
await cache.getUser('abc')

// Invalidates both getUser('abc') and listUsers()
await cache.invalidateTag('user')
```

### Redis Backend

```typescript
import { createCache } from '@requence/cache'
import createRedisBackend from '@requence/cache/redis'

const cache = createCache({
  backend: createRedisBackend({
    url: process.env.REDIS_URL,
    prefix: 'myapp',
    ttl: 300_000,
  }),
})
```

## Documentation

Full documentation — including concept guides and API reference — is available at:

**[https://cache.docs.requence.cloud](https://cache.docs.requence.cloud)**

## License

[MIT](./LICENSE)
