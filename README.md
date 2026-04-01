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
graph.findPath("dataflow_data_items", "modules")
// [
//   { from: { table: "dataflow_data_items", column: "dataflow_id" }, to: { table: "dataflow", column: "id" } },
//   { from: { table: "dataflow", column: "module_id" }, to: { table: "modules", column: "id" } },
// ]
```

### Table Metadata

```typescript
graph.getTable("data_items")
// {
//   name: "data_items",
//   note: "COBOL data item declarations (fields and groups) from the DATA DIVISION.",
//   columns: [
//     { name: "id", type: "INTEGER" },
//     { name: "module_id", type: "INTEGER", fk: { table: "modules", column: "id" } },
//     { name: "levelNumber", type: "INTEGER", note: "COBOL level number (01, 05, 10, etc.)" },
//     ...
//   ]
// }
```

### Navigation

```typescript
// What tables reference modules?
graph.getReferencingTables("modules")
// [{ table: "data_items", column: "module_id", myColumn: "id" }, ...]

// What's directly connected to data_items?
graph.getNeighbors("data_items")
// {
//   parents: [{ table: "modules", via: "module_id" }, ...],
//   children: [{ table: "data_item_source_lines", via: "data_item_id" }, ...]
// }

// Schema overview
graph.getSummary()
// [{ name: "fileset", tableCount: 7, tables: [...] }, ...]

// Search across table/column names and notes
graph.searchSchema("copybook")
// [{ table: "copybooks", match: "table_name", text: "copybooks" }, ...]
```

### Groups and Colors

```typescript
graph.getGroups()       // all TableGroups with member tables
graph.getGroup("modules")  // { name: "fileset", tables: ["copybooks", "modules", ...] }
graph.getTableColor("modules")  // "#3498db"
graph.getGroupColor("fileset")  // "#3498db"
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
