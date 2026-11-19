---
'@requence/cache': patch
---

A process that starts while Redis is down for longer than about ten seconds now gets invalidations from other processes once Redis is back. Before, its subscription gave up after 20 retries and was never made again, so the process served stale values until it was restarted. The subscriber connection now waits for Redis.
