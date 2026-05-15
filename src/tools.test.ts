import { describe, it, expect } from "bun:test"
import { DbmlGraph } from "./graph"
import { bindSchemaTools, schemaToolDefinitions } from "./tools"

const SIMPLE_DBML = `
Table "users" {
  "id" INTEGER [pk]
  "name" VARCHAR [note: 'Full name of the user']
  Note: 'Registered users'
}

Table "orders" {
  "id" INTEGER [pk]
  "user_id" INTEGER
  "product" VARCHAR
  Note: 'Customer orders'
}

Table "order_items" {
  "order_id" INTEGER
  "quantity" INTEGER
}

Table "orphan" {
  "id" INTEGER [pk]
}

Ref: orders.user_id > users.id
Ref: "orders"."id" < "order_items"."order_id"

TableGroup "commerce" {
  "orders"
  "order_items"
}
`

describe("schemaToolDefinitions", () => {
  it("contains 7 definitions", () => {
    expect(schemaToolDefinitions).toHaveLength(7)
  })

  it("all definitions have name, description, schema, and handler", () => {
    for (const def of schemaToolDefinitions) {
      expect(typeof def.name).toBe("string")
      expect(typeof def.description).toBe("string")
      expect(def.schema).toBeDefined()
      expect(typeof def.handler).toBe("function")
    }
  })

  it("all definitions have unique names", () => {
    const names = schemaToolDefinitions.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("all names start with schema_", () => {
    for (const def of schemaToolDefinitions) {
      expect(def.name).toMatch(/^schema_/)
    }
  })

  it("does not require a graph to inspect metadata", () => {
    const names = schemaToolDefinitions.map((d) => d.name)
    expect(names).toContain("schema_search")
  })
})

describe("bindSchemaTools", () => {
  const graph = new DbmlGraph(SIMPLE_DBML)
  const tools = bindSchemaTools(graph)

  function findTool(name: string) {
    const t = tools.find((t) => t.name === name)
    if (!t) throw new Error(`Tool ${name} not found`)
    return t
  }

  it("returns one bound tool per definition", () => {
    expect(tools).toHaveLength(schemaToolDefinitions.length)
  })

  it("preserves metadata from the definitions", () => {
    for (let i = 0; i < tools.length; i++) {
      expect(tools[i]!.name).toBe(schemaToolDefinitions[i]!.name)
      expect(tools[i]!.description).toBe(schemaToolDefinitions[i]!.description)
      expect(tools[i]!.schema).toBe(schemaToolDefinitions[i]!.schema)
    }
  })

  describe("schema_search", () => {
    it("returns object with search results", () => {
      const result = findTool("schema_search").invoke({ query: "user" }) as {
        searchResults: unknown[]
        tableDescriptions: unknown[]
      }
      expect(result.searchResults.length).toBeGreaterThan(0)
      expect(result.tableDescriptions.length).toBeGreaterThan(0)
    })

    it("returns empty results for no matches", () => {
      const result = findTool("schema_search").invoke({ query: "zzz" }) as {
        searchResults: unknown[]
      }
      expect(result.searchResults).toHaveLength(0)
    })
  })

  describe("schema_summary", () => {
    it("returns array of group summaries", () => {
      const result = findTool("schema_summary").invoke({}) as Array<{
        groupName: string
        tableCount: number
      }>
      expect(result.length).toBeGreaterThan(0)
      const commerce = result.find((g) => g.groupName === "commerce")
      expect(commerce).toBeDefined()
      expect(commerce!.tableCount).toBe(2)
    })
  })

  describe("schema_table_info", () => {
    it("returns object with table columns", () => {
      const result = findTool("schema_table_info").invoke({ table: "users" }) as {
        name: string
        columns: unknown[]
      }
      expect(result.name).toBe("users")
      expect(result.columns.length).toBeGreaterThan(0)
    })

    it("returns null for nonexistent table", () => {
      const result = findTool("schema_table_info").invoke({ table: "nope" })
      expect(result).toBeNull()
    })
  })

  describe("schema_find_join_path", () => {
    it("returns array of path steps", () => {
      const result = findTool("schema_find_join_path").invoke({
        from: "orders",
        to: "users",
      }) as Array<{ from: { table: string }; to: { table: string } }>
      expect(result).toHaveLength(1)
      expect(result[0]!.from.table).toBe("orders")
      expect(result[0]!.to.table).toBe("users")
    })

    it("returns null for unreachable tables", () => {
      const result = findTool("schema_find_join_path").invoke({
        from: "users",
        to: "orphan",
      })
      expect(result).toBeNull()
    })

    it("throws for unknown table", () => {
      expect(() =>
        findTool("schema_find_join_path").invoke({ from: "nonexistent", to: "users" }),
      ).toThrow()
    })
  })

  describe("schema_neighbors", () => {
    it("returns parents and children", () => {
      const result = findTool("schema_neighbors").invoke({ table: "orders" }) as {
        parents: Array<{ table: string; via: string }>
        children: Array<{ table: string; via: string }>
      }
      expect(result.parents).toContainEqual({ table: "users", via: "user_id" })
      expect(result.children).toContainEqual({ table: "order_items", via: "order_id" })
    })
  })

  describe("schema_relationships", () => {
    it("returns all relationships when no table given", () => {
      const result = findTool("schema_relationships").invoke({}) as unknown[]
      expect(result).toHaveLength(2)
    })

    it("filters by table when provided", () => {
      const result = findTool("schema_relationships").invoke({ table: "users" }) as Array<{
        childTable: string
        parentTable: string
      }>
      expect(result.length).toBeGreaterThan(0)
      for (const r of result) {
        expect(r.childTable === "users" || r.parentTable === "users").toBe(true)
      }
    })
  })

  describe("schema_referencing_tables", () => {
    it("returns tables that FK into the given table", () => {
      const result = findTool("schema_referencing_tables").invoke({ table: "orders" })
      expect(result).toContainEqual({
        table: "order_items",
        column: "order_id",
        myColumn: "id",
      })
    })

    it("returns empty for table with no inbound FKs", () => {
      const result = findTool("schema_referencing_tables").invoke({ table: "orphan" }) as unknown[]
      expect(result).toHaveLength(0)
    })
  })
})
