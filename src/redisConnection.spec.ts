import { setTimeout } from 'node:timers/promises'

import { expect, it, spyOn } from 'bun:test'

import createRedisBackend from './backends/RedisBackend.ts'

it('reports an unreachable Redis once per client, not once per attempt', async () => {
  const consoleError = spyOn(console, 'error').mockImplementation(() => {})
  try {
    // Port 1 refuses at once, so ioredis retries several times in a second.
    createRedisBackend({
      url: 'redis://127.0.0.1:1',
      prefix: `unreachable-${crypto.randomUUID()}`,
    })
    await setTimeout(1000)

    const lost = consoleError.mock.calls.filter(([message]) =>
      String(message).includes('connection lost'),
    )
    expect(lost).toHaveLength(2)
  } finally {
    consoleError.mockRestore()
  }
})
