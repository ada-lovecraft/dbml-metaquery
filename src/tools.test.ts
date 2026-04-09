import { describe, it, expect } from "bun:test"
import { DbmlGraph } from "./graph"
import { createSchemaTools } from "./tools"

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

describe("createSchemaTools", () => {
  const graph = new DbmlGraph(SIMPLE_DBML)
  const tools = createSchemaTools(graph)

  it("returns 7 tools", () => {
    expect(tools).toHaveLength(7)
  })

  it("all tools have unique names", () => {
    const names = tools.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("all tool names start with schema_", () => {
    for (const t of tools) {
      expect(t.name).toMatch(/^schema_/)
    }
  })

  it("all tools have descriptions", () => {
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  function findTool(name: string) {
    const t = tools.find((t) => t.name === name)
    if (!t) throw new Error(`Tool ${name} not found`)
    return t
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function invokeTool(name: string, input: Record<string, any> = {}): Promise<string> {
    const t = findTool(name)
    return (t as any).invoke(input) as Promise<string>
  }

  describe("schema_search", () => {
    it("returns JSON with search results", async () => {
      const result = await invokeTool("schema_search", { query: "user" })
      const parsed = JSON.parse(result)
      expect(parsed.searchResults.length).toBeGreaterThan(0)
      expect(parsed.tableDescriptions.length).toBeGreaterThan(0)
    })

    it("returns empty results for no matches", async () => {
      const result = await invokeTool("schema_search", { query: "zzz" })
      const parsed = JSON.parse(result)
      expect(parsed.searchResults).toHaveLength(0)
    })
  })

  describe("schema_summary", () => {
    it("returns JSON with group summaries", async () => {
      const result = await invokeTool("schema_summary")
      const parsed = JSON.parse(result)
      expect(parsed.length).toBeGreaterThan(0)
      const commerce = parsed.find((g: { groupName: string }) => g.groupName === "commerce")
      expect(commerce).toBeDefined()
      expect(commerce.tableCount).toBe(2)
    })
  })

  describe("schema_table_info", () => {
    it("returns JSON with table columns", async () => {
      const result = await invokeTool("schema_table_info", { table: "users" })
      const parsed = JSON.parse(result)
      expect(parsed.name).toBe("users")
      expect(parsed.columns.length).toBeGreaterThan(0)
    })

    it("returns null for nonexistent table", async () => {
      const result = await invokeTool("schema_table_info", { table: "nope" })
      expect(result).toBe("null")
    })
  })

  describe("schema_find_join_path", () => {
    it("returns JSON with path steps", async () => {
      const result = await invokeTool("schema_find_join_path", { from: "orders", to: "users" })
      const parsed = JSON.parse(result)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].from.table).toBe("orders")
      expect(parsed[0].to.table).toBe("users")
    })

    it("returns null for unreachable tables", async () => {
      const result = await invokeTool("schema_find_join_path", { from: "users", to: "orphan" })
      expect(result).toBe("null")
    })

    it("throws for unknown table", async () => {
      expect(invokeTool("schema_find_join_path", { from: "nonexistent", to: "users" })).rejects.toThrow()
    })
  })

  describe("schema_neighbors", () => {
    it("returns JSON with parents and children", async () => {
      const result = await invokeTool("schema_neighbors", { table: "orders" })
      const parsed = JSON.parse(result)
      expect(parsed.parents).toContainEqual({ table: "users", via: "user_id" })
      expect(parsed.children).toContainEqual({ table: "order_items", via: "order_id" })
    })
  })

  describe("schema_relationships", () => {
    it("returns all relationships when no table given", async () => {
      const result = await invokeTool("schema_relationships")
      const parsed = JSON.parse(result)
      expect(parsed).toHaveLength(2)
    })

    it("filters by table when provided", async () => {
      const result = await invokeTool("schema_relationships", { table: "users" })
      const parsed = JSON.parse(result)
      expect(parsed.length).toBeGreaterThan(0)
      for (const r of parsed) {
        expect(r.childTable === "users" || r.parentTable === "users").toBe(true)
      }
    })
  })

  describe("schema_referencing_tables", () => {
    it("returns tables that FK into the given table", async () => {
      const result = await invokeTool("schema_referencing_tables", { table: "orders" })
      const parsed = JSON.parse(result)
      expect(parsed).toContainEqual({
        table: "order_items",
        column: "order_id",
        myColumn: "id",
      })
    })

    it("returns empty for table with no inbound FKs", async () => {
      const result = await invokeTool("schema_referencing_tables", { table: "orphan" })
      const parsed = JSON.parse(result)
      expect(parsed).toHaveLength(0)
    })
  })
})
