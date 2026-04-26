import { Redis } from 'ioredis'
import superjson from 'superjson'

import type { BackendCollectionResult, CacheBackend } from './type.ts'

const SEPARATOR = ':::'

const knownRedisBackends = new Set<string>()

interface RedisBackendOptions {
  prefix?: string
  url?: string
  ttl?: number
  lockTTL?: number
  database?: number
}

export default function createRedisBackend(options: RedisBackendOptions) {
  return new RedisBackend(options)
}

export class RedisBackend implements CacheBackend {
  private redis: Redis
  private prefix: string
  private lockTTL: number
  private ttl: number
  private pendingValues = new Map<string, PromiseWithResolvers<void>>()

  constructor(options: RedisBackendOptions) {
    const redisBackendKey = [options.url, options.database, options.prefix]
      .filter(Boolean)
      .join('-')

    if (knownRedisBackends.has(redisBackendKey)) {
      throw new Error(
        `a redis backend with url=${options.url ?? 'default'}, database=${options.database ?? 'default'} and prefix=${options.prefix ?? 'default'} already exisits`,
      )
    }
    knownRedisBackends.add(redisBackendKey)

    this.redis = options.url
      ? new Redis(options.url, { db: options.database })
      : new Redis({ db: options.database })
    this.prefix = options.prefix ?? 'cache'
    this.lockTTL = options.lockTTL ?? 10_000
    this.ttl = options.ttl ?? 0

    this.setupSubscription(options.url, options.database)
  }

  private setupSubscription(url?: string, db?: number) {
    const subRedis = url ? new Redis(url, { db }) : new Redis({ db })
    subRedis.psubscribe(`${this.prefix}-channel:*`)
    subRedis.on(
      'pmessage',
      (_pattern, channel, message: 'PENDING' | 'ERROR' | 'DONE') => {
        const pendingValue = this.pendingValues.get(channel)

        if (!pendingValue) {
          return
        }
        if (message === 'DONE') {
          pendingValue.resolve()
        } else if (message === 'ERROR') {
          pendingValue.reject(new Error('Generator failed'))
        }
      },
    )
  }

  private getDataKey(key: string, args: string) {
    return `${this.prefix}:${key}:${args}`
  }

  private getGroupKey(key: string) {
    return `${this.prefix}-group:${key}`
  }

  private getTagKey(tag: string) {
    return `${this.prefix}-tag:${tag}`
  }

  private getChannelKey(key: string, args: string) {
    return `${this.prefix}-channel:${key}:${args}`
  }

  private getLockKey(key: string, args: string) {
    return `${this.prefix}-lock:${key}:${args}`
  }

  async get(key: string, args: string): Promise<any> {
    const channelKey = this.getChannelKey(key, args)
    await this.pendingValues.get(channelKey)?.promise
    const raw = await this.redis.get(this.getDataKey(key, args))
    if (raw) {
      return superjson.parse(raw)
    }

    const isLocked = await this.redis.exists(this.getLockKey(key, args))
    if (isLocked) {
      await this.waitForResult(channelKey)
      return this.get(key, args)
    }

    throw new Error()
  }

  async getTags(key: string, args: string) {
    const memberId = `${key}${SEPARATOR}${args}`
    const tags: string[] = []
    const tagKeyPattern = `${this.prefix}-tag:*`
    let cursor = '0'

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        tagKeyPattern,
        'COUNT',
        100,
      )

      cursor = newCursor

      if (keys.length) {
        const pipeline = this.redis.pipeline()
        for (const tagKey of keys) {
          pipeline.sismember(tagKey, memberId)
        }

        const res = await pipeline.exec()
        for (let i = 0; i < keys.length; i++) {
          const err = res?.[i]?.[0]
          const isMember = res?.[i]?.[1]
          if (!err && isMember === 1) {
            tags.push(keys[i].slice(tagKeyPattern.length - 1))
          }
        }
      }
    } while (cursor !== '0')

    return tags
  }

  private async waitForResult(channelKey: string) {
    if (this.pendingValues.has(channelKey)) {
      return this.pendingValues.get(channelKey)!.promise
    }

    const resolvers = Promise.withResolvers<void>()
    this.pendingValues.set(channelKey, resolvers)

    const timeout = setTimeout(
      () => resolvers.reject(new Error('Timeout waiting for cache')),
      this.lockTTL,
    ).unref()

    try {
      await resolvers.promise
    } finally {
      clearTimeout(timeout)
      this.pendingValues.delete(channelKey)
    }
  }

  async set(
    key: string,
    args: string,
    collectionResult: BackendCollectionResult,
  ) {
    const lockKey = this.getLockKey(key, args)
    const channelKey = this.getChannelKey(key, args)

    await this.redis.set(lockKey, 'PENDING', 'PX', this.lockTTL)
    await this.redis.publish(channelKey, 'PENDING')

    try {
      const collected = await collectionResult
      if (!collected || !collected.shouldCache) {
        await this.redis.del(lockKey)
        await this.redis.publish(channelKey, 'DONE')
        return
      }
      const { result, tags } = collected
      const dataKey = this.getDataKey(key, args)
      const groupKey = this.getGroupKey(key)
      const pipeline = this.redis.pipeline()
      const serialized = superjson.stringify(result)
      if (this.ttl > 0) {
        pipeline.set(dataKey, serialized, 'PX', this.ttl)
      } else {
        pipeline.set(dataKey, serialized)
      }
      pipeline.sadd(groupKey, args)
      const memberId = `${key}${SEPARATOR}${args}`
      for (const tag of tags) {
        pipeline.sadd(this.getTagKey(tag), memberId)
      }

      pipeline.del(lockKey)
      await pipeline.exec()
      await this.redis.publish(channelKey, 'DONE')
    } catch (error) {
      await this.redis.del(lockKey)
      await this.redis.publish(channelKey, 'ERROR')
      throw error
    }
  }

  async invalidateArgs(key: string, args: string) {
    await this.redis
      .pipeline()
      .del(this.getDataKey(key, args))
      .srem(this.getGroupKey(key), args)
      .exec()
  }

  async invalidateKey(key: string) {
    const groupKey = this.getGroupKey(key)
    const allArgs = await this.redis.smembers(groupKey)
    if (allArgs.length === 0) {
      return
    }
    const dataKeys = allArgs.map((args) => this.getDataKey(key, args))
    this.redis.del(groupKey, ...dataKeys)
  }

  async invalidateTag(tag: string) {
    const tagKey = this.getTagKey(tag)
    const members = await this.redis.smembers(tagKey)
    if (members.length === 0) {
      return
    }
    const pipeline = this.redis.pipeline()
    for (const member of members) {
      const [key, args] = member.split(SEPARATOR)
      pipeline.del(this.getDataKey(key, args))
      pipeline.srem(this.getGroupKey(key), args)
    }

    pipeline.del(tagKey)
    await pipeline.exec()
  }

  async reset() {
    const pattern = `${this.prefix}*`
    let cursor = '0'

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      )
      cursor = newCursor

      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } while (cursor !== '0')

    this.pendingValues.clear()
  }
}
