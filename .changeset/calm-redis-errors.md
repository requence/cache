---
'@requence/cache': patch
---

The Redis backend no longer floods the log while Redis is unreachable. Its two connections now each print one line when the connection is lost and one when it is back. Before, ioredis printed an "Unhandled error event" with a stack trace on every reconnect attempt, for every cache. A failed subscribe is now reported instead of becoming an unhandled rejection.
