// NOTE: local bindings to work around a Bun bundler bug where
// pure `export { X } from './Y'` re-exports produce an index.js
// without actual import statements.
// See: https://github.com/oven-sh/bun/issues/27709
import {
  createCache as _createCache,
  createCachingDisabledScope as _createCachingDisabledScope,
  resetAllCaches as _resetAllCaches,
  withCachingDisabled as _withCachingDisabled,
} from './createCache.ts'
export type { CachingDisableScope } from './createCache.ts'

import {
  addCacheTag as _addCacheTag,
  dontCache as _dontCache,
} from './cacheContext.ts'

const createCache = _createCache
const createCachingDisabledScope = _createCachingDisabledScope
const resetAllCaches = _resetAllCaches
const withCachingDisabled = _withCachingDisabled
const addCacheTag = _addCacheTag
const dontCache = _dontCache

export {
  createCache,
  createCachingDisabledScope,
  resetAllCaches,
  withCachingDisabled,
  addCacheTag,
  dontCache,
}
