import type {
  BackendCollectionResult,
  CacheBackend,
  CacheBackendOptions,
} from './type.ts'

export class MemoryBackend implements CacheBackend {
  public readonly data = new Map<
    string,
    Map<string, { value: Promise<any>; time: number; tags: Set<string> }>
  >()
  public readonly tags = new Map<string, Set<[string, string]>>()

  constructor(private options: CacheBackendOptions) {}

  private addTags(key: string, args: string, tags: Set<string>) {
    const dataSet = this.data.get(key)?.get(args)
    if (!dataSet) {
      return
    }

    for (const tag of tags) {
      dataSet.tags.add(tag)
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set())
      }
      this.tags.get(tag)!.add([key, args])
    }
  }

  private clearExpired() {
    if (this.options.ttl === 0) {
      return
    }

    const now = Date.now()
    for (const [key, results] of this.data) {
      for (const [args, result] of results) {
        if (now - result.time > this.options.ttl) {
          results.delete(args)

          for (const tag of result.tags) {
            const tags = this.tags.get(tag)!
            tags.forEach((dataRef) => {
              if (dataRef[0] === key && dataRef[1] === args) {
                tags.delete(dataRef)
              }
            })

            if (tags.size === 0) {
              this.tags.delete(tag)
            }
          }
        }
      }
      if (results.size === 0) {
        this.data.delete(key)
      }
    }
  }

  async get(key: string, subKey: string) {
    this.clearExpired()
    const entry = this.data.get(key)?.get(subKey)
    if (entry) {
      if (entry.value) {
        return entry.value
      }

      this.data.get(key)?.delete(subKey)
    }

    throw new Error('key not in store')
  }

  async getTags(key: string, subKey: string) {
    return Array.from(this.data.get(key)?.get(subKey)?.tags ?? [])
  }

  async set(
    key: string,
    args: string,
    collectionResult: BackendCollectionResult,
  ) {
    this.clearExpired()
    if (!this.data.has(key)) {
      this.data.set(key, new Map())
    }
    const map = this.data.get(key)!

    map.set(args, {
      value: collectionResult.then((collected) => collected?.result),
      time: Date.now(),
      tags: new Set(),
    })

    if (this.options.size && map.size > this.options.size) {
      map.delete(map.keys().next().value!)
    }

    const collected = await collectionResult
    if (collected && collected.shouldCache) {
      this.addTags(key, args, collected.tags)
    } else {
      map.delete(args)
    }
  }

  async invalidateArgs(key: string, args: string) {
    this.clearExpired()

    const entry = this.data.get(key)?.get(args)
    if (entry) {
      this.data.get(key)!.delete(args)
    }

    for (const [tag, results] of this.tags) {
      for (const result of results) {
        if (result[0] === key && result[1] === args) {
          results.delete(result)
        }
      }
      if (results.size === 0) {
        this.tags.delete(tag)
      }
    }
  }

  async invalidateKey(key: string) {
    this.clearExpired()

    const map = this.data.get(key)
    if (map) {
      this.data.delete(key)
    }

    for (const [tag, results] of this.tags) {
      for (const result of results) {
        if (result[0] === key) {
          results.delete(result)
        }
      }
      if (results.size === 0) {
        this.tags.delete(tag)
      }
    }
  }

  async invalidateTag(tag: string) {
    this.clearExpired()
    if (!this.tags.has(tag)) {
      return
    }

    for (const [key, args] of this.tags.get(tag)!) {
      const map = this.data.get(key)
      if (map) {
        const entry = map.get(args)
        if (entry) {
          map.delete(args)
        }
        if (map.size === 0) {
          this.data.delete(key)
        }
      }
    }
    this.tags.delete(tag)
  }

  async reset() {
    this.data.clear()
    this.tags.clear()
  }
}
