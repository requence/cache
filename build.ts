import { mkdir, rm } from 'node:fs/promises'

const SRC = './src'
const OUT = './dist'

// Clean dist
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const result = await Bun.build({
  entrypoints: [
    `${SRC}/index.ts`,
    `${SRC}/backends/RedisBackend.ts`,
  ],
  outdir: OUT,
  root: SRC,
  target: 'node',
  format: 'esm',
  splitting: false,
  sourcemap: 'external',
  external: ['ioredis', 'superjson', 'node-object-hash'],
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Generate .d.ts files via tsc
const tsc = Bun.spawn(['bunx', 'tsc'], {
  stdout: 'inherit',
  stderr: 'inherit',
})
const tscExit = await tsc.exited

if (tscExit !== 0) {
  console.error('TypeScript declaration generation failed')
  process.exit(1)
}

console.log(`✓ Built ${result.outputs.length} files to ${OUT}/`)
