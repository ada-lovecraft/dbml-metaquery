/**
 * Types for the DBML Path Finder.
 */

export interface PathStep {
  from: { table: string; column: string }
  to: { table: string; column: string }
}

export interface Relationship {
  childTable: string
  childColumn: string
  parentTable: string
  parentColumn: string
}

export interface TableInfo {
  name: string
  note?: string
  columns: ColumnInfo[]
}

export interface ColumnInfo {
  name: string
  type: string
  note?: string
  fk?: { table: string; column: string }
}

export interface GroupInfo {
  name: string
  tables: string[]
}

export interface ReferencingTable {
  table: string
  column: string
  myColumn: string
}

export interface Neighbors {
  parents: { table: string; via: string }[]
  children: { table: string; via: string }[]
}

export interface GroupSummary {
  name: string
  tableCount: number
  tables: string[]
}

export interface SearchResult {
  table: string
  match: "table_name" | "table_note" | "column_name" | "column_note"
  column?: string
  text: string
}
