import type { BackendCollectionResult, CacheBackend } from './type.ts'

export default class CombinedBackend implements CacheBackend {
  constructor(private backends: Array<CacheBackend>) {}
  async get(key: string, args: string) {
    return Promise.any(
      this.backends.map((backend) => backend.get(key, args)),
    ).catch(() => undefined)
  }
  async getTags(key: string, args: string) {
    return Promise.any(
      this.backends.map((backend) => backend.getTags(key, args)),
    )
  }
  async set(
    key: string,
    args: string,
    collectionResult: BackendCollectionResult,
  ) {
    await Promise.all(
      this.backends.map((backend) => backend.set(key, args, collectionResult)),
    )
  }
  async invalidateArgs(key: string, args: string) {
    await Promise.all(
      this.backends.map((backend) => backend.invalidateArgs(key, args)),
    )
  }
  async invalidateKey(key: string) {
    await Promise.all(
      this.backends.map((backend) => backend.invalidateKey(key)),
    )
  }
  async invalidateTag(tag: string) {
    await Promise.all(
      this.backends.map((backend) => backend.invalidateTag(tag)),
    )
  }
  async reset() {
    await Promise.all(this.backends.map((backend) => backend.reset()))
  }
}
