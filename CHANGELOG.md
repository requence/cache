# @requence/cache

## 1.0.2

### Patch Changes

- 1809440: Fixed TypeScript declaration files being emitted to `dist/src/` instead of `dist/`, which caused `package.json` `types` entries to point to non-existent paths. Added `tsconfig.build.json` scoped to `src/` only, and updated the build script to use it — keeping full type checking for `build.ts` in the IDE via the main `tsconfig.json`.

## 1.0.1

### Patch Changes

- [`d6b70c9`](https://github.com/requence/cache/commit/d6b70c91018538440f9afc81dbd5d50818cb80d4) Thanks [@Torsten85](https://github.com/Torsten85)! - fixed esm export

## 1.0.0

### Major Changes

- [`eb9ded2`](https://github.com/requence/cache/commit/eb9ded2cc36252c22fc3c17fa8e4bcc4dba570e2) Thanks [@Torsten85](https://github.com/Torsten85)! - Initial release
