import { describe, it, expect } from "bun:test"
import { DbmlGraph } from "./graph"

const SIMPLE_DBML = `
Table "users" [headercolor: #3498db] {
  "id" INTEGER [pk]
  "name" VARCHAR [note: 'Full name of the user']
  Note: 'Registered users'
}

Table "departments" [headercolor: #3498db] {
  "id" INTEGER [pk]
  "title" VARCHAR
  Note: 'Organizational departments'
}

Table "orders" [headercolor: #2ecc71] {
  "id" INTEGER [pk]
  "user_id" INTEGER
  "product" VARCHAR [note: 'Product name']
  "quantity" INTEGER [note: 'Number of items ordered']
  Note: 'Customer orders'
}

Table "order_items" [headercolor: #2ecc71] {
  "order_id" INTEGER
  "department_id" INTEGER
  Note: 'Line items within an order'
}

Table "orphan_table" {
  "id" INTEGER [pk]
  "value" VARCHAR
}

Ref "fk_0":"orders"."id" < "order_items"."order_id"
Ref: orders.user_id > users.id
Ref: order_items.department_id > departments.id

TableGroup "people" [color: #3498db] {
  "users"
  "departments"
}

TableGroup "commerce" [color: #2ecc71] {
  "orders"
  "order_items"
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
      expect(tables).toContain("users")
      expect(tables).toContain("departments")
      expect(tables).toContain("orders")
      expect(tables).toContain("order_items")
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
      const rels = graph.getRelationships("orders")
      // orders is parent of order_items AND child of users
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
      const path = graph.findPath("orders", "users")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(1)
      expect(path![0]!.from).toEqual({
        table: "orders",
        column: "user_id",
      })
      expect(path![0]!.to).toEqual({ table: "users", column: "id" })
    })

    it("finds 2-hop path", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("order_items", "users")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(2)
      // First hop: order_items -> orders
      expect(path![0]!.from.table).toBe("order_items")
      expect(path![0]!.to.table).toBe("orders")
      // Second hop: orders -> users
      expect(path![1]!.from.table).toBe("orders")
      expect(path![1]!.to.table).toBe("users")
    })

    it("finds reverse direction path (parent to child)", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("users", "orders")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(1)
      // Traversing FK in reverse: users.id <- orders.user_id
      expect(path![0]!.from.table).toBe("users")
      expect(path![0]!.to.table).toBe("orders")
    })

    it("returns null for unreachable tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("users", "orphan_table")
      expect(path).toBeNull()
    })

    it("returns empty array for same table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const path = graph.findPath("users", "users")
      expect(path).not.toBeNull()
      expect(path).toHaveLength(0)
    })

    it("throws for unknown table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(() => graph.findPath("nonexistent", "users")).toThrow()
    })
  })

  describe("getTable", () => {
    it("returns TableInfo for existing table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("orders")
      expect(table).toBeDefined()
      expect(table!.name).toBe("orders")
      expect(table!.note).toBe("Customer orders")
    })

    it("returns columns with types", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("orders")!
      const idCol = table.columns.find((c) => c.name === "id")
      expect(idCol).toBeDefined()
      expect(idCol!.type).toBe("INTEGER")
    })

    it("returns column notes", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("orders")!
      const nameCol = table.columns.find((c) => c.name === "product")
      expect(nameCol!.note).toBe("Product name")
      const qtyCol = table.columns.find((c) => c.name === "quantity")
      expect(qtyCol!.note).toBe("Number of items ordered")
    })

    it("populates fk on many-side columns", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("orders")!
      const fkCol = table.columns.find((c) => c.name === "user_id")
      expect(fkCol!.fk).toEqual({ table: "users", column: "id" })
    })

    it("omits fk on non-FK columns", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const table = graph.getTable("users")!
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
      expect(names).toContain("people")
      expect(names).toContain("commerce")
    })

    it("groups contain their member tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const people = graph.getGroups().find((g) => g.name === "people")!
      expect(people.tables).toContain("users")
      expect(people.tables).toContain("departments")
    })

    it("returns empty array when no groups", () => {
      const graph = new DbmlGraph(MINIMAL_DBML)
      expect(graph.getGroups()).toHaveLength(0)
    })
  })

  describe("getGroup", () => {
    it("returns the group containing a table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const group = graph.getGroup("users")
      expect(group).toBeDefined()
      expect(group!.name).toBe("people")
    })

    it("returns undefined for ungrouped table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getGroup("orphan_table")).toBeUndefined()
    })
  })

  describe("getTableColor", () => {
    it("returns headercolor for a table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getTableColor("users")).toBe("#3498db")
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
      expect(graph.getGroupColor("people")).toBe("#3498db")
    })

    it("returns undefined for nonexistent group", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getGroupColor("nope")).toBeUndefined()
    })
  })

  describe("getReferencingTables", () => {
    it("returns tables that FK into the given table", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const refs = graph.getReferencingTables("orders")
      expect(refs).toContainEqual({
        table: "order_items",
        column: "order_id",
        myColumn: "id",
      })
    })

    it("returns multiple entries for heavily referenced tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const refs = graph.getReferencingTables("users")
      expect(refs).toHaveLength(1)
      expect(refs[0]!.table).toBe("orders")
    })

    it("returns empty array for table with no inbound FKs", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      expect(graph.getReferencingTables("orphan_table")).toHaveLength(0)
    })
  })

  describe("getNeighbors", () => {
    it("returns parents and children", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const n = graph.getNeighbors("orders")
      expect(n.parents).toContainEqual({ table: "users", via: "user_id" })
      expect(n.children).toContainEqual({ table: "order_items", via: "order_id" })
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
      const people = summary.find((s) => s.name === "people")!
      expect(people.tableCount).toBe(2)
      expect(people.tables).toContain("users")
    })

    it("includes ungrouped tables", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const summary = graph.getSummary()
      const ungrouped = summary.find((s) => s.name === "ungrouped")!
      expect(ungrouped).toBeDefined()
      expect(ungrouped.tables).toContain("orphan_table")
    })

    it("returns ungrouped when no groups defined", () => {
      const graph = new DbmlGraph(MINIMAL_DBML)
      const summary = graph.getSummary()
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
      const results = graph.searchSchema("Registered users")
      expect(results.find((r) => r.match === "table_note" && r.table === "users")).toBeDefined()
    })

    it("matches column names", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("user_id")
      expect(results.find((r) => r.match === "column_name" && r.table === "orders")).toBeDefined()
    })

    it("matches column notes", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("Number of items")
      expect(results.find((r) => r.match === "column_note" && r.column === "quantity")).toBeDefined()
    })

    it("is case insensitive", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("USERS")
      expect(results.find((r) => r.table === "users" && r.match === "table_name")).toBeDefined()
    })

    it("sorts results: table_name > table_note > column_name > column_note", () => {
      const graph = new DbmlGraph(SIMPLE_DBML)
      const results = graph.searchSchema("order")
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
