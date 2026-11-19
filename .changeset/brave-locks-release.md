---
'@requence/cache': patch
---

A cached function no longer hangs forever after its backend failed to store a value. When `set` threw (for example, Redis was unreachable), the in-flight marker for that key was never released, so every later call with the same arguments waited on it until the process restarted. A failed store is now ignored: the call returns the computed value, and the next call computes again.
