# @requence/cache

## 1.0.5

### Patch Changes

- f17ce4d: The Redis backend no longer floods the log while Redis is unreachable. Its two connections now each print one line when the connection is lost and one when it is back. Before, ioredis printed an "Unhandled error event" with a stack trace on every reconnect attempt, for every cache. A failed subscribe is now reported instead of becoming an unhandled rejection.
- cf827b2: A process that starts while Redis is down for longer than about ten seconds now gets invalidations from other processes once Redis is back. Before, its subscription gave up after 20 retries and was never made again, so the process served stale values until it was restarted. The subscriber connection now waits for Redis.

## 1.0.4

### Patch Changes

- 427c879: A cached function no longer hangs forever after its backend failed to store a value. When `set` threw (for example, Redis was unreachable), the in-flight marker for that key was never released, so every later call with the same arguments waited on it until the process restarted. A failed store is now ignored: the call returns the computed value, and the next call computes again.

## 1.0.3

### Patch Changes

- c3e7bb2: Invalidations now reach the memory layer of every process that shares a Redis backend. Before, `invalidate`, `invalidateAll`, `invalidateTag`, `clear` and `reset` only cleared the memory layer of the process that called them, so every other process kept serving the old value until it was evicted. The Redis backend now publishes each invalidation on a `<prefix>-invalidation` channel after the delete, and each process drops the same entries from its memory layer. A custom `CacheBackend` can take part through the new optional `onRemoteInvalidation` method.

  `invalidateTag` now resolves only after the backends have finished the invalidation. Before, it resolved at once.

## 1.0.2

### Patch Changes

- 1809440: Fixed TypeScript declaration files being emitted to `dist/src/` instead of `dist/`, which caused `package.json` `types` entries to point to non-existent paths. Added `tsconfig.build.json` scoped to `src/` only, and updated the build script to use it — keeping full type checking for `build.ts` in the IDE via the main `tsconfig.json`.

## 1.0.1

### Patch Changes

- [`d6b70c9`](https://github.com/requence/cache/commit/d6b70c91018538440f9afc81dbd5d50818cb80d4) Thanks [@Torsten85](https://github.com/Torsten85)! - fixed esm export

## 1.0.0

### Major Changes

- [`eb9ded2`](https://github.com/requence/cache/commit/eb9ded2cc36252c22fc3c17fa8e4bcc4dba570e2) Thanks [@Torsten85](https://github.com/Torsten85)! - Initial release
