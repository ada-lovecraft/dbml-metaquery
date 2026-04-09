/**
 * DbmlGraph -- parses DBML via @dbml/parse, builds a graphology graph,
 * and provides FK path finding + rich schema metadata.
 */

import Graph from "graphology"
import { bidirectional } from "graphology-shortest-path"
import { Compiler } from "@dbml/parse"
import type {
  PathStep,
  Relationship,
  TableInfo,
  ColumnInfo,
  GroupInfo,
  ReferencingTable,
  Neighbors,
  GroupSummary,
  SearchResult,
  SearchResultResponse,
} from "./types"

interface EdgeAttributes {
  childTable: string
  childColumn: string
  parentTable: string
  parentColumn: string
}

export class DbmlGraph {
  private graph: Graph
  private relationships: Relationship[]
  private tableSet: Set<string>
  private tableInfoMap: Map<string, TableInfo>
  private tableColorMap: Map<string, string>
  private groupList: GroupInfo[]
  private tableToGroup: Map<string, GroupInfo>
  private groupColorMap: Map<string, string>

  constructor(dbml: string) {
    this.graph = new Graph({ type: "undirected", multi: true })
    this.tableInfoMap = new Map()
    this.tableColorMap = new Map()
    this.groupList = []
    this.tableToGroup = new Map()
    this.groupColorMap = new Map()
    this.relationships = []
    this.tableSet = new Set()

    const compiler = new Compiler()
    compiler.setSource(dbml)
    const db = compiler.parse.rawDb()
    if (!db) throw new Error("Failed to parse DBML")

    // Build FK lookup: "table.column" (many side) -> { table, column } (one side)
    const fkMap = new Map<string, { table: string; column: string }>()
    for (const ref of db.refs) {
      const [ep0, ep1] = ref.endpoints
      if (!ep0 || !ep1) continue

      const child = ep0.relation === "*" ? ep0 : ep1
      const parent = ep0.relation === "1" ? ep0 : ep1

      const childCol = child.fieldNames[0]
      const parentCol = parent.fieldNames[0]
      if (!childCol || !parentCol) continue

      fkMap.set(`${child.tableName}.${childCol}`, {
        table: parent.tableName,
        column: parentCol,
      })

      this.relationships.push({
        childTable: child.tableName,
        childColumn: childCol,
        parentTable: parent.tableName,
        parentColumn: parentCol,
      })
    }

    // Build table info + graph nodes
    for (const table of db.tables) {
      this.tableSet.add(table.name)
      this.graph.addNode(table.name)

      if (table.headerColor) {
        this.tableColorMap.set(table.name, table.headerColor)
      }

      const columns: ColumnInfo[] = table.fields.map((field) => {
        const col: ColumnInfo = {
          name: field.name,
          type: field.type.type_name,
        }
        if (field.note?.value) col.note = field.note.value
        const fk = fkMap.get(`${table.name}.${field.name}`)
        if (fk) col.fk = fk
        return col
      })

      const info: TableInfo = { name: table.name, columns }
      if (table.note?.value) info.note = table.note.value
      this.tableInfoMap.set(table.name, info)
    }

    // Build graph edges
    for (const rel of this.relationships) {
      if (!this.tableSet.has(rel.childTable) || !this.tableSet.has(rel.parentTable)) {
        continue
      }
      const key = `${rel.childTable}.${rel.childColumn}->${rel.parentTable}.${rel.parentColumn}`
      this.graph.addEdgeWithKey(key, rel.childTable, rel.parentTable, {
        childTable: rel.childTable,
        childColumn: rel.childColumn,
        parentTable: rel.parentTable,
        parentColumn: rel.parentColumn,
      } as EdgeAttributes)
    }

    // Build groups
    for (const group of db.tableGroups) {
      if (!group.name) continue
      const info: GroupInfo = {
        name: group.name,
        tables: group.tables.map((t) => t.name),
      }
      this.groupList.push(info)
      for (const t of info.tables) {
        this.tableToGroup.set(t, info)
      }
      if (group.color) {
        this.groupColorMap.set(group.name, group.color)
      }
    }
  }

  /**
   * Find the shortest FK path between two tables.
   * Returns PathStep[] representing each JOIN hop, or null if unreachable.
   * Returns empty array if from === to.
   */
  findPath(from: string, to: string): PathStep[] | null {
    if (!this.tableSet.has(from)) {
      throw new Error(`Table "${from}" not found in DBML`)
    }
    if (!this.tableSet.has(to)) {
      throw new Error(`Table "${to}" not found in DBML`)
    }

    if (from === to) return []

    const nodePath = bidirectional(this.graph, from, to)
    if (!nodePath) return null

    const steps: PathStep[] = []
    for (let i = 0; i < nodePath.length - 1; i++) {
      const current = nodePath[i]!
      const next = nodePath[i + 1]!
      const step = this.findEdgeStep(current, next)
      if (step) {
        steps.push(step)
      }
    }

    return steps
  }

  /** Get all table names in the graph. */
  getTables(): string[] {
    return [...this.tableSet].sort()
  }

  /** Get FK relationships, optionally filtered to those involving a specific table. */
  getRelationships(table?: string): Relationship[] {
    if (!table) return [...this.relationships]
    return this.relationships.filter(
      (r) => r.childTable === table || r.parentTable === table,
    )
  }

  /** Get data-relevant info for a table: name, note, columns with types/notes/FK. */
  getTable(name: string): TableInfo | undefined {
    return this.tableInfoMap.get(name)
  }

  /** Get all TableGroups with names and member tables. */
  getGroups(): GroupInfo[] {
    return [...this.groupList]
  }

  /** Get the group that contains a given table. */
  getGroup(tableName: string): GroupInfo | undefined {
    return this.tableToGroup.get(tableName)
  }

  /** Get the headercolor for a table. */
  getTableColor(name: string): string | undefined {
    return this.tableColorMap.get(name)
  }

  /** Get the color for a group. */
  getGroupColor(name: string): string | undefined {
    return this.groupColorMap.get(name)
  }

  /** Get tables that have FK columns pointing at the given table. */
  getReferencingTables(tableName: string): ReferencingTable[] {
    return this.relationships
      .filter((r) => r.parentTable === tableName)
      .map((r) => ({
        table: r.childTable,
        column: r.childColumn,
        myColumn: r.parentColumn,
      }))
  }

  /** Get one-hop connections: parents (tables I FK to) and children (tables that FK to me). */
  getNeighbors(tableName: string): Neighbors {
    const info = this.tableInfoMap.get(tableName)
    const parents: { table: string; via: string }[] = []
    if (info) {
      for (const col of info.columns) {
        if (col.fk) {
          parents.push({ table: col.fk.table, via: col.name })
        }
      }
    }

    const children = this.getReferencingTables(tableName).map((r) => ({
      table: r.table,
      via: r.column,
    }))

    return { parents, children }
  }

  /** High-level schema overview: groups with table counts, plus ungrouped tables. */
  getSummary(): GroupSummary[] {
    const toSummaryTable = (name: string) => {
      const info = this.tableInfoMap.get(name)
      const entry: { name: string; note?: string } = { name }
      if (info?.note) entry.note = info.note
      return entry
    }

    const summary: GroupSummary[] = this.groupList.map((g) => ({
      groupName: g.name,
      tableCount: g.tables.length,
      tables: [...g.tables].sort().map(toSummaryTable),
    }))

    const grouped = new Set<string>()
    for (const g of this.groupList) {
      for (const t of g.tables) grouped.add(t)
    }

    const ungrouped = [...this.tableSet].filter((t) => !grouped.has(t)).sort()
    if (ungrouped.length > 0) {
      summary.push({
        groupName: "ungrouped",
        tableCount: ungrouped.length,
        tables: ungrouped.map(toSummaryTable),
      })
    }

    return summary
  }

  /** Get a copy of the underlying graphology graph for external analysis. */
  getGraph(): Graph {
    return this.graph.copy()
  }

  /** Case-insensitive substring search across table names, notes, column names, and column notes. */
  searchSchema(query: string): SearchResultResponse {
    const q = query.toLowerCase()
    const results: SearchResult[] = []

    for (const table of this.tableInfoMap.values()) {
      if (table.name.toLowerCase().includes(q)) {
        results.push({ table: table.name, match: "table_name", text: table.name })
      }
      if (table.note?.toLowerCase().includes(q)) {
        results.push({ table: table.name, match: "table_note", text: table.note })
      }
      for (const col of table.columns) {
        if (col.name.toLowerCase().includes(q)) {
          results.push({ table: table.name, match: "column_name", column: col.name, text: col.name })
        }
        if (col.note?.toLowerCase().includes(q)) {
          results.push({ table: table.name, match: "column_note", column: col.name, text: col.note })
        }
      }
    }

    const order: Record<string, number> = { table_name: 0, table_note: 1, column_name: 2, column_note: 3 }
    results.sort((a, b) => order[a.match]! - order[b.match]!)

    const uniqueTables = [...new Set(results.map((r) => r.table))].sort()
    const tableDescriptions = uniqueTables.map((name) => {
      const info = this.tableInfoMap.get(name)
      const entry: { name: string; note?: string } = { name }
      if (info?.note) entry.note = info.note
      return entry
    })

    return { searchResults: results, tableDescriptions }
  }

  private findEdgeStep(current: string, next: string): PathStep | null {
    const edges = this.graph.edges(current, next)
    if (edges.length === 0) return null

    const attrs = this.graph.getEdgeAttributes(edges[0]!) as EdgeAttributes

    if (attrs.childTable === current && attrs.parentTable === next) {
      return {
        from: { table: attrs.childTable, column: attrs.childColumn },
        to: { table: attrs.parentTable, column: attrs.parentColumn },
      }
    } else {
      return {
        from: { table: attrs.parentTable, column: attrs.parentColumn },
        to: { table: attrs.childTable, column: attrs.childColumn },
      }
    }
  }
}
