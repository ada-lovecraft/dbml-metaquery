# dbml-metaquery

Parse DBML into a navigable graph with rich metadata -- FK path finding, table info, groups, and schema search.

Uses `@dbml/parse` for correct handling of all DBML syntax.

## Installation

```bash
npm install dbml-metaquery
# or
bun add dbml-metaquery
```

## Library API

```typescript
import { DbmlGraph } from "dbml-metaquery"
import { readFileSync } from "fs"

const dbml = readFileSync("model.dbml", "utf-8")
const graph = new DbmlGraph(dbml)
```

### Path Finding

```typescript
graph.findPath("order_items", "users")
// [
//   { from: { table: "order_items", column: "order_id" }, to: { table: "orders", column: "id" } },
//   { from: { table: "orders", column: "user_id" }, to: { table: "users", column: "id" } },
// ]
```

### Table Metadata

```typescript
graph.getTable("orders")
// {
//   name: "orders",
//   note: "Customer orders",
//   columns: [
//     { name: "id", type: "INTEGER" },
//     { name: "user_id", type: "INTEGER", fk: { table: "users", column: "id" } },
//     { name: "product", type: "VARCHAR", note: "Product name" },
//     ...
//   ]
// }
```

### Navigation

```typescript
// What tables reference users?
graph.getReferencingTables("users")
// [{ table: "orders", column: "user_id", myColumn: "id" }, ...]

// What's directly connected to orders?
graph.getNeighbors("orders")
// {
//   parents: [{ table: "users", via: "user_id" }],
//   children: [{ table: "order_items", via: "order_id" }]
// }

// Schema overview
graph.getSummary()
// [{ groupName: "people", tableCount: 2, tables: ["users", "departments"] }, ...]

// Search across table/column names and notes
graph.searchSchema("order")
// [{ table: "orders", match: "table_name", text: "orders" }, ...]
```

### Groups and Colors

```typescript
graph.getGroups()       // all TableGroups with member tables
graph.getGroup("users")  // { name: "people", tables: ["users", "departments"] }
graph.getTableColor("users")  // "#3498db"
graph.getGroupColor("people")  // "#3498db"
```

### Raw Graph Access

```typescript
const g = graph.getGraph() // graphology Graph copy
g.nodes()                  // all table names
g.edges()                  // all FK edges
g.forEachEdge((edge, attrs) => { /* custom traversal */ })
```

### All Methods

| Method | Returns | Description |
|---|---|---|
| `findPath(from, to)` | `PathStep[] \| null` | Shortest FK path between two tables |
| `getTables()` | `string[]` | All table names, sorted |
| `getRelationships(table?)` | `Relationship[]` | FK relationships, optionally filtered |
| `getTable(name)` | `TableInfo \| undefined` | Table note, columns with types/notes/FKs |
| `getGroups()` | `GroupInfo[]` | All TableGroups with member tables |
| `getGroup(tableName)` | `GroupInfo \| undefined` | Which group a table belongs to |
| `getTableColor(name)` | `string \| undefined` | Table headercolor |
| `getGroupColor(name)` | `string \| undefined` | Group color |
| `getReferencingTables(name)` | `ReferencingTable[]` | Tables that FK into this table |
| `getNeighbors(name)` | `Neighbors` | One-hop parents and children |
| `getSummary()` | `GroupSummary[]` | Groups with table counts |
| `searchSchema(query)` | `SearchResult[]` | Substring search across names and notes |
| `getGraph()` | `Graph` | Copy of the underlying graphology graph for external analysis |

## CLI

The first argument is always the path to a `.dbml` file, followed by a command.

```bash
dbml-metaquery model.dbml find-path <from> <to>   # Shortest FK path
dbml-metaquery model.dbml info <table>             # Table metadata
dbml-metaquery model.dbml neighbors <table>        # Directly connected tables
dbml-metaquery model.dbml refs-to <table>          # Tables that FK into this table
dbml-metaquery model.dbml rels <table>             # All FK relationships
dbml-metaquery model.dbml search <query>           # Search names and notes
dbml-metaquery model.dbml summary                  # Schema overview
dbml-metaquery model.dbml tables                   # List all tables
```

## License

MIT
