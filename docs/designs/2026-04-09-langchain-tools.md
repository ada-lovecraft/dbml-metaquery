# Design: LangChain Tool Export (`dbml-metaquery/tools`)

## Problem

LLM agents that work with database schemas need structured tools to explore and query schema metadata. dbml-metaquery already has the right methods -- search, path-finding, table inspection -- but there's no way to hand them to a LangChain agent without manual wrapping.

## Solution

Add a subpath export `dbml-metaquery/tools` that exposes a `createSchemaTools(graph)` factory. It returns an array of LangChain `tool()` instances ready to bind to an LLM.

## API

```ts
import { DbmlGraph } from "dbml-metaquery"
import { createSchemaTools } from "dbml-metaquery/tools"

const graph = new DbmlGraph(dbmlSource)
const tools = createSchemaTools(graph)

// Bind to an LLM
const llm = new ChatAnthropic({ model: "claude-sonnet-4-20250514" })
const agent = llm.bindTools(tools)
```

### Factory signature

```ts
export function createSchemaTools(graph: DbmlGraph): ReturnType<typeof tool>[]
```

### Tool definitions

Each tool follows the pattern:

```ts
tool(
  async (params) => JSON.stringify(graph.method(params)),
  {
    name: "schema_xxx",
    description: "...",
    schema: z.object({ ... }),
  }
)
```

#### schema_search

Search table names, column names, and notes by substring.

```ts
tool(
  async ({ query }) => JSON.stringify(graph.searchSchema(query)),
  {
    name: "schema_search",
    description:
      "Search the database schema for tables, columns, and notes matching a query string. " +
      "Returns matching results grouped by match type (table name, table note, column name, column note) " +
      "along with descriptions of all tables that matched. Use this as your first step to find relevant tables.",
    schema: z.object({
      query: z.string().describe("Case-insensitive substring to search for across table names, column names, and notes"),
    }),
  }
)
```

#### schema_summary

Get a high-level overview of the schema.

```ts
tool(
  async () => JSON.stringify(graph.getSummary()),
  {
    name: "schema_summary",
    description:
      "Get a high-level summary of the entire database schema. " +
      "Returns all table groups with their table counts and member tables (including notes). " +
      "Ungrouped tables appear under a synthetic 'ungrouped' group. " +
      "Use this to orient yourself before drilling into specific tables.",
    schema: z.object({}),
  }
)
```

#### schema_table_info

Get detailed column-level info for a specific table.

```ts
tool(
  async ({ table }) => JSON.stringify(graph.getTable(table)),
  {
    name: "schema_table_info",
    description:
      "Get detailed information about a specific table including all columns with their types, notes, " +
      "and foreign key references. Returns undefined if the table does not exist.",
    schema: z.object({
      table: z.string().describe("Exact table name (case-sensitive)"),
    }),
  }
)
```

#### schema_find_join_path

Find the shortest FK path between two tables.

```ts
tool(
  async ({ from, to }) => JSON.stringify(graph.findPath(from, to)),
  {
    name: "schema_find_join_path",
    description:
      "Find the shortest foreign-key join path between two tables. " +
      "Returns an ordered array of join steps, each with from/to table and column. " +
      "Returns null if no path exists. Returns an empty array if from and to are the same table. " +
      "Throws if either table name is not found in the schema.",
    schema: z.object({
      from: z.string().describe("Source table name (case-sensitive)"),
      to: z.string().describe("Target table name (case-sensitive)"),
    }),
  }
)
```

#### schema_neighbors

Get one-hop FK connections for a table.

```ts
tool(
  async ({ table }) => JSON.stringify(graph.getNeighbors(table)),
  {
    name: "schema_neighbors",
    description:
      "Get the immediate FK neighbors of a table. " +
      "Returns parents (tables this table has foreign keys pointing to) " +
      "and children (tables that have foreign keys pointing to this table), " +
      "each with the column used for the relationship.",
    schema: z.object({
      table: z.string().describe("Exact table name (case-sensitive)"),
    }),
  }
)
```

#### schema_relationships

Get FK relationships, optionally filtered by table.

```ts
tool(
  async ({ table }) => JSON.stringify(graph.getRelationships(table)),
  {
    name: "schema_relationships",
    description:
      "Get foreign key relationships. If a table name is provided, returns only relationships " +
      "involving that table (as either child or parent). If no table is provided, returns all " +
      "relationships in the schema. Each relationship shows child table/column and parent table/column.",
    schema: z.object({
      table: z.string().optional().describe("Optional table name to filter relationships (case-sensitive)"),
    }),
  }
)
```

#### schema_referencing_tables

Get tables that FK into a given table.

```ts
tool(
  async ({ table }) => JSON.stringify(graph.getReferencingTables(table)),
  {
    name: "schema_referencing_tables",
    description:
      "Get all tables that have a foreign key pointing to the given table. " +
      "Returns the referencing table name, its FK column, and the column it references. " +
      "Useful for understanding what depends on a table.",
    schema: z.object({
      table: z.string().describe("Exact table name (case-sensitive)"),
    }),
  }
)
```

## Dependencies

**Peer dependencies** (consumer installs):
```json
"peerDependencies": {
  "@langchain/core": ">=0.3.0",
  "zod": ">=3.0.0"
},
"peerDependenciesMeta": {
  "@langchain/core": { "optional": true },
  "zod": { "optional": true }
}
```

Marked optional so `npm install dbml-metaquery` doesn't force LangChain on consumers who only use the core library.

**Dev dependencies** (for building/testing):
```json
"@langchain/core": "^0.3.0",
"zod": "^3.0.0"
```

## Package exports

```json
"./tools": {
  "bun": "./dist/tools.bun.js",
  "import": "./dist/tools.js",
  "types": "./dist/tools.d.ts"
}
```

The main `"."` entry point does NOT re-export tools, keeping the core package free of LangChain/Zod imports.

## Build changes

- Add `src/tools.ts` to the `bun build` invocations in the build script
- Add `src/tools.ts` to `tsconfig.build.json` include array

## File layout

```
src/
  tools.ts          # createSchemaTools factory
  tools.test.ts     # tests
```
