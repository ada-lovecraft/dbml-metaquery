# Design: searchSchema return type redesign

**Date:** 2026-04-09
**Status:** Draft

## Problem

The current `searchSchema` returns a flat `SearchResult[]`. This is useful for seeing exactly what matched and where, but consumers often need to know which tables were involved in the results and their metadata. Today they must call `getTable()` separately for each unique table in the results to get notes and other info.

### Current signature

```typescript
searchSchema(query: string): SearchResult[]

interface SearchResult {
  table: string
  match: "table_name" | "table_note" | "column_name" | "column_note"
  column?: string
  text: string
}
```

## Proposed change

Keep `SearchResult` as-is. Wrap it in a new `SearchResultResponse` that pairs the existing results with table descriptions for every unique table referenced in the results.

### New signature

```typescript
searchSchema(query: string): SearchResultResponse

interface SearchResultResponse {
  searchResults: SearchResult[]
  tableDescriptions: SummaryTable[]
}
```

### Behavior

- `searchResults` -- identical to what `searchSchema` returns today. Same matching logic, same sort order (table_name > table_note > column_name > column_note), same case-insensitive substring matching.
- `tableDescriptions` -- a deduplicated, alphabetically sorted list of `SummaryTable` objects (name + optional note) for every unique table that appears in `searchResults`. Reuses the existing `SummaryTable` type from the `getSummary()` API.

### Empty results

When nothing matches, returns `{ searchResults: [], tableDescriptions: [] }`.

### Example

```typescript
graph.searchSchema("order")
// {
//   searchResults: [
//     { table: "orders", match: "table_name", text: "orders" },
//     { table: "orders", match: "table_note", text: "Customer orders" },
//     { table: "order_items", match: "table_name", text: "order_items" },
//     { table: "order_items", match: "column_name", column: "order_id", text: "order_id" },
//   ],
//   tableDescriptions: [
//     { name: "order_items", note: "Line items within an order" },
//     { name: "orders", note: "Customer orders" },
//   ]
// }
```

## Alternatives considered

### A. Replace SearchResult entirely with structured grouping

Return `{ tables: SummaryTable[], columns: MatchedColumn[] }` instead of the flat list. Rejected because `SearchResult` already carries useful match-type discrimination that callers rely on. Wrapping preserves backward compatibility of the data shape while adding the missing table context.

### B. Add columnType to SearchResult

Minimal change: add `columnType?: string` to `SearchResult`. Doesn't solve the table-description problem and further overloads an already wide type.

### C. Leave it to callers

Callers can already call `getTable()` per unique table. This works but is repetitive boilerplate that every consumer ends up writing. Centralizing it in the response eliminates that.

## Impact

### Types

- New: `SearchResultResponse`
- Unchanged: `SearchResult`, `SummaryTable`

### graph.ts

After building the existing `SearchResult[]`, collect unique table names, look up each in `tableInfoMap`, build `SummaryTable` objects, sort, and return both in the wrapper.

### CLI

The `search` command currently iterates `SearchResult[]`. It would change to access `result.searchResults` instead. `tableDescriptions` can optionally be displayed as a summary header.

### Tests

Existing `searchSchema` tests need minor updates to unwrap `.searchResults` from the response. New tests should cover:

- `tableDescriptions` contains all unique tables from results
- `tableDescriptions` includes notes where present
- `tableDescriptions` is sorted alphabetically
- `tableDescriptions` is empty when no matches
- Tables appearing in multiple results are not duplicated in `tableDescriptions`

### Breaking change

The return type changes from `SearchResult[]` to `SearchResultResponse`. This is a breaking change for callers that destructure or iterate the return value directly. The underlying `SearchResult` type and its contents are unchanged.
