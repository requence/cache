import { setTimeout } from 'node:timers/promises'

import { expect, it, spyOn } from 'bun:test'

import createRedisBackend from './backends/RedisBackend.ts'

// ioredis gives up on a command after 20 retries, which takes about 10.5s.
it('reports an unreachable Redis once per client and keeps the subscriptions waiting', async () => {
  const consoleError = spyOn(console, 'error').mockImplementation(() => {})
  try {
    // Port 1 refuses at once, so ioredis retries until it gives up.
    createRedisBackend({
      url: 'redis://127.0.0.1:1',
      prefix: `unreachable-${crypto.randomUUID()}`,
    })
    await setTimeout(11_000)

    const messages = consoleError.mock.calls.map(([message]) => String(message))
    expect(messages.filter((m) => m.includes('connection lost'))).toHaveLength(
      2,
    )
    expect(messages.filter((m) => m.includes('subscription failed'))).toEqual(
      [],
    )
  } finally {
    consoleError.mockRestore()
  }
}, 15_000)
