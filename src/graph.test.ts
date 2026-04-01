import { describe, it, expect } from "bun:test"
import { DbmlGraph } from "./graph"

const SIMPLE_DBML = `
Table "modules" [headercolor: #3498db] {
  "id" INTEGER [pk]
  "name" VARCHAR [note: 'Module name as declared in the source']
  Note: 'Distinct program modules'
}

Table "source_files" [headercolor: #3498db] {
  "id" INTEGER [pk]
  "fileName" VARCHAR
  Note: 'Master inventory of source files'
}

Table "data_items" [headercolor: #2ecc71] {
  "id" INTEGER [pk]
  "module_id" INTEGER
  "name" VARCHAR [note: 'Data item name']
  "levelNumber" INTEGER [note: 'COBOL level number (01, 05, 10, etc.)']
  Note: 'COBOL data item declarations'
}

Table "data_item_source_lines" [headercolor: #2ecc71] {
  "data_item_id" INTEGER
  "source_file_id" INTEGER
  Note: 'Source locations of data item declarations'
}

Table "orphan_table" {
  "id" INTEGER [pk]
  "value" VARCHAR
}

Ref "fk_0":"data_items"."id" < "data_item_source_lines"."data_item_id"
Ref: data_items.module_id > modules.id
Ref: data_item_source_lines.source_file_id > source_files.id

TableGroup "infrastructure" [color: #3498db] {
  "modules"
  "source_files"
}

TableGroup "code_structure" [color: #2ecc71] {
  "data_items"
  "data_item_source_lines"
}
`

const MINIMAL_DBML = `
Table "solo" {
  "id" INTEGER [pk]
}
`

describe("DbmlGraph", () => {
  describe("constructor", () => {
    it("parses DBML and builds graph", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getTables().length).toBeGreaterThan(0)
    })
  })

  describe("getTables", () => {
    it("returns all table names", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const tables = graph.getTables()
      expect(tables).toContain("modules")
      expect(tables).toContain("source_files")
      expect(tables).toContain("data_items")
      expect(tables).toContain("data_item_source_lines")
      expect(tables).toContain("orphan_table")
      expect(tables).toHaveLength(5)
    })
  })

  describe("getRelationships", () => {
    it("returns all relationships when no table specified", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const rels = graph.getRelationships()
      expect(rels).toHaveLength(3)
    })

    it("returns relationships for a specific table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const rels = graph.getRelationships("data_items")
      // data_items is parent of data_item_source_lines AND child of modules
      expect(rels.length).toBeGreaterThanOrEqual(2)
    })

    it("returns empty for table with no relationships", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const rels = graph.getRelationships("orphan_table")
      expect(rels).toHaveLength(0)
    })
  })

  describe("findPath", () => {
    it("finds 1-hop path (direct FK)", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("data_items", "modules")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(1)
      expect(path![0]!.from).toEqual({
        table: "data_items",
        column: "module_id",
      })
      expect(path![0]!.to).toEqual({ table: "modules", column: "id" })
    })

    it("finds 2-hop path", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("data_item_source_lines", "modules")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(2)
      // First hop: data_item_source_lines -> data_items
      expect(path![0]!.from.table).toBe("data_item_source_lines")
      expect(path![0]!.to.table).toBe("data_items")
      // Second hop: data_items -> modules
      expect(path![1]!.from.table).toBe("data_items")
      expect(path![1]!.to.table).toBe("modules")
    })

    it("finds reverse direction path (parent to child)", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("modules", "data_items")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(1)
      // Traversing FK in reverse: modules.id <- data_items.module_id
      expect(path![0]!.from.table).toBe("modules")
      expect(path![0]!.to.table).toBe("data_items")
    })

    it("returns null for unreachable tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("modules", "orphan_table")
      expect(path).toBeNull()
    })

    it("returns empty array for same table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("modules", "modules")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(0)
    })

    it("throws for unknown table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(() => graph.findPath("nonexistent", "modules")).toThrow()
    })
  })

  describe("getTable", () => {
    it("returns TableInfo for existing table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("data_items")
      expect(table).toBeDefined()
      expect(table!.name).toBe("data_items")
      expect(table!.note).toBe("COBOL data item declarations")
    })

    it("returns columns with types", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("data_items")!
      const idCol = table.columns.find((c) => c.name === "id")
      expect(idCol).toBeDefined()
      expect(idCol!.type).toBe("INTEGER")
    })

    it("returns column notes", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("data_items")!
      const nameCol = table.columns.find((c) => c.name === "name")
      expect(nameCol!.note).toBe("Data item name")
      const levelCol = table.columns.find((c) => c.name === "levelNumber")
      expect(levelCol!.note).toBe("COBOL level number (01, 05, 10, etc.)")
    })

    it("populates fk on many-side columns", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("data_items")!
      const fkCol = table.columns.find((c) => c.name === "module_id")
      expect(fkCol!.fk).toEqual({ table: "modules", column: "id" })
    })

    it("omits fk on non-FK columns", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("modules")!
      const idCol = table.columns.find((c) => c.name === "id")
      expect(idCol!.fk).toBeUndefined()
    })

    it("returns undefined for nonexistent table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getTable("nope")).toBeUndefined()
    })

    it("returns table without note when none exists", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("orphan_table")!
      expect(table.note).toBeUndefined()
    })
  })

  describe("getGroups", () => {
    it("returns all groups", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const groups = graph.getGroups()
      expect(groups).toHaveLength(2)
      const names = groups.map((g) => g.name)
      expect(names).toContain("infrastructure")
      expect(names).toContain("code_structure")
    })

    it("groups contain their member tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const infra = graph.getGroups().find((g) => g.name === "infrastructure")!
      expect(infra.tables).toContain("modules")
      expect(infra.tables).toContain("source_files")
    })

    it("returns empty array when no groups", () => {
      const graph = new DbmlGraph(MINIMAL_DBML)
      expect(graph.getGroups()).toHaveLength(0)
    })
  })

  describe("getGroup", () => {
    it("returns the group containing a table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const group = graph.getGroup("modules")
      expect(group).toBeDefined()
      expect(group!.name).toBe("infrastructure")
    })

    it("returns undefined for ungrouped table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getGroup("orphan_table")).toBeUndefined()
    })
  })

  describe("getTableColor", () => {
    it("returns headercolor for a table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getTableColor("modules")).toBe("#3498db")
    })

    it("returns undefined for table without color", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getTableColor("orphan_table")).toBeUndefined()
    })

    it("returns undefined for nonexistent table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getTableColor("nope")).toBeUndefined()
    })
  })

  describe("getGroupColor", () => {
    it("returns color for a group", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getGroupColor("infrastructure")).toBe("#3498db")
    })

    it("returns undefined for nonexistent group", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getGroupColor("nope")).toBeUndefined()
    })
  })

  describe("getReferencingTables", () => {
    it("returns tables that FK into the given table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const refs = graph.getReferencingTables("data_items")
      expect(refs).toContainEqual({
        table: "data_item_source_lines",
        column: "data_item_id",
        myColumn: "id",
      })
    })

    it("returns multiple entries for heavily referenced tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const refs = graph.getReferencingTables("modules")
      expect(refs).toHaveLength(1)
      expect(refs[0]!.table).toBe("data_items")
    })

    it("returns empty array for table with no inbound FKs", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getReferencingTables("orphan_table")).toHaveLength(0)
    })
  })

  describe("getNeighbors", () => {
    it("returns parents and children", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const n = graph.getNeighbors("data_items")
      expect(n.parents).toContainEqual({ table: "modules", via: "module_id" })
      expect(n.children).toContainEqual({ table: "data_item_source_lines", via: "data_item_id" })
    })

    it("returns empty for orphan table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const n = graph.getNeighbors("orphan_table")
      expect(n.parents).toHaveLength(0)
      expect(n.children).toHaveLength(0)
    })
  })

  describe("getSummary", () => {
    it("returns groups with table counts", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const summary = graph.getSummary()
      const infra = summary.find((s) => s.name === "infrastructure")!
      expect(infra.tableCount).toBe(2)
      expect(infra.tables).toContain("modules")
    })

    it("includes ungrouped tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const summary = graph.getSummary()
      const ungrouped = summary.find((s) => s.name === "ungrouped")!
      expect(ungrouped).toBeDefined()
      expect(ungrouped.tables).toContain("orphan_table")
    })

    it("returns empty when no groups and no tables", () => {
      const graph = new DbmlGraph(MINIMAL_DBML)
      const summary = graph.getSummary()
      // solo table is ungrouped
      expect(summary).toHaveLength(1)
      expect(summary[0]!.name).toBe("ungrouped")
    })
  })

  describe("searchSchema", () => {
    it("matches table names", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("orphan")
      expect(results).toContainEqual({
        table: "orphan_table",
        match: "table_name",
        text: "orphan_table",
      })
    })

    it("matches table notes", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("program modules")
      expect(results.find((r) => r.match === "table_note" && r.table === "modules")).toBeDefined()
    })

    it("matches column names", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("module_id")
      expect(results.find((r) => r.match === "column_name" && r.table === "data_items")).toBeDefined()
    })

    it("matches column notes", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("level number")
      expect(results.find((r) => r.match === "column_note" && r.column === "levelNumber")).toBeDefined()
    })

    it("is case insensitive", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("MODULES")
      expect(results.find((r) => r.table === "modules" && r.match === "table_name")).toBeDefined()
    })

    it("sorts results: table_name > table_note > column_name > column_note", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("data")
      const matchOrder = results.map((r) => r.match)
      const nameIdx = matchOrder.indexOf("table_name")
      const noteIdx = matchOrder.indexOf("table_note")
      const colIdx = matchOrder.indexOf("column_name")
      const colNoteIdx = matchOrder.indexOf("column_note")
      if (nameIdx >= 0 && noteIdx >= 0) expect(nameIdx).toBeLessThan(noteIdx)
      if (noteIdx >= 0 && colIdx >= 0) expect(noteIdx).toBeLessThan(colIdx)
      if (colIdx >= 0 && colNoteIdx >= 0) expect(colIdx).toBeLessThan(colNoteIdx)
    })

    it("returns empty for no matches", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.searchSchema("zzz_nonexistent")).toHaveLength(0)
    })
  })

})
