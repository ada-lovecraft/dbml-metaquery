# Bug: bun export condition points to missing src/index.ts

**Date:** 2026-04-08
**Version:** 1.1.0
**Severity:** Blocker (package cannot be imported by bun consumers)

## Problem

The published package's `exports` field in `package.json` includes a `bun` condition:

```json
"exports": {
  ".": {
    "bun": "./src/index.ts",
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

But the `files` field only includes `"src/cli.ts"`:

```json
"files": ["dist", "README.md", "src/cli.ts"]
```

The published package contains `src/cli.ts` but NOT `src/index.ts`. Bun follows the `bun` condition first, tries to load `src/index.ts`, fails, and does not fall back to the `import` condition. Result: `Cannot find package 'dbml-metaquery'` for any bun consumer.

## Fix

Either:
1. Add `"src/index.ts"` to the `files` array (so it's included in the published package)
2. Or add `"src"` to `files` to include all source files

Option 1 is minimal:
```json
"files": ["dist", "README.md", "src/cli.ts", "src/index.ts"]
```

## Reproduction

```bash
# In any bun workspace project
bun add dbml-metaquery@1.1.0
```

```typescript
// test.ts
import { DbmlGraph } from "dbml-metaquery"
console.log(typeof DbmlGraph)
```

```bash
bun run test.ts
# Error: Cannot find package 'dbml-metaquery'
```

## Workaround

Create the missing file manually in node_modules:
```bash
echo 'export * from "../dist/index.js"' > node_modules/dbml-metaquery/src/index.ts
```
