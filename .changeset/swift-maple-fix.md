---
'@requence/cache': patch
---

Fixed TypeScript declaration files being emitted to `dist/src/` instead of `dist/`, which caused `package.json` `types` entries to point to non-existent paths. Added `tsconfig.build.json` scoped to `src/` only, and updated the build script to use it — keeping full type checking for `build.ts` in the IDE via the main `tsconfig.json`.
