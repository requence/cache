import { hasher } from 'node-object-hash'

function isHashable(value: unknown, visited = new WeakSet<object>()): boolean {
  if (value === null || value === undefined) {
    return true
  }

  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true
  }

  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    return false
  }

  if (type === 'object') {
    if (visited.has(value as object)) {
      return false
    }
    visited.add(value as object)

    if (
      value instanceof Date ||
      value instanceof RegExp ||
      value instanceof Promise
    ) {
      return false
    }

    if (Array.isArray(value)) {
      return value.every((item) => isHashable(item, visited))
    }

    return Object.values(value as object).every((item) =>
      isHashable(item, visited),
    )
  }

  return false
}

const argHasher = hasher({
  sort: true,
  coerce: false,
})

export default function hashArgs(args: any[]) {
  if (!isHashable(args)) {
    throw new Error(
      'Cache skipped: Arguments contain non-hashable values (Functions, Circular refs, etc)',
    )
  }
  return argHasher.hash(args)
}
