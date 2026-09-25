---
'@requence/cache': patch
---

Invalidations now reach the memory layer of every process that shares a Redis backend. Before, `invalidate`, `invalidateAll`, `invalidateTag`, `clear` and `reset` only cleared the memory layer of the process that called them, so every other process kept serving the old value until it was evicted. The Redis backend now publishes each invalidation on a `<prefix>-invalidation` channel after the delete, and each process drops the same entries from its memory layer. A custom `CacheBackend` can take part through the new optional `onRemoteInvalidation` method.

`invalidateTag` now resolves only after the backends have finished the invalidation. Before, it resolved at once.
