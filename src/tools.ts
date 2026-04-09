/**
 * LangChain tool wrappers for DbmlGraph methods.
 *
 * Usage:
 *   import { DbmlGraph } from "dbml-metaquery"
 *   import { createSchemaTools } from "dbml-metaquery/tools"
 *   const tools = createSchemaTools(new DbmlGraph(dbml))
 */

import { tool } from "@langchain/core/tools"
import { z } from "zod"
import type { DbmlGraph } from "./graph"

export function createSchemaTools(graph: DbmlGraph) {
  const schemaSearch = tool(
    async ({ query }) => JSON.stringify(graph.searchSchema(query)),
    {
      name: "schema_search",
      description:
        "Search the database schema for tables, columns, and notes matching a query string. " +
        "Returns matching results grouped by match type (table name, table note, column name, column note) " +
        "along with descriptions of all tables that matched. Use this as your first step to find relevant tables.",
      schema: z.object({
        query: z.string().describe(
          "Case-insensitive substring to search for across table names, column names, and notes",
        ),
      }),
    },
  )

  const schemaSummary = tool(
    async () => JSON.stringify(graph.getSummary()),
    {
      name: "schema_summary",
      description:
        "Get a high-level summary of the entire database schema. " +
        "Returns all table groups with their table counts and member tables (including notes). " +
        "Ungrouped tables appear under a synthetic 'ungrouped' group. " +
        "Use this to orient yourself before drilling into specific tables.",
      schema: z.object({}),
    },
  )

  const schemaTableInfo = tool(
    async ({ table }) => JSON.stringify(graph.getTable(table) ?? null),
    {
      name: "schema_table_info",
      description:
        "Get detailed information about a specific table including all columns with their types, notes, " +
        "and foreign key references. Returns null if the table does not exist.",
      schema: z.object({
        table: z.string().describe("Exact table name (case-sensitive)"),
      }),
    },
  )

  const schemaFindJoinPath = tool(
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
    },
  )

  const schemaNeighbors = tool(
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
    },
  )

  const schemaRelationships = tool(
    async ({ table }) => JSON.stringify(graph.getRelationships(table)),
    {
      name: "schema_relationships",
      description:
        "Get foreign key relationships. If a table name is provided, returns only relationships " +
        "involving that table (as either child or parent). If no table is provided, returns all " +
        "relationships in the schema. Each relationship shows child table/column and parent table/column.",
      schema: z.object({
        table: z
          .string()
          .optional()
          .describe(
            "Optional table name to filter relationships (case-sensitive)",
          ),
      }),
    },
  )

  const schemaReferencingTables = tool(
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
    },
  )

  return [
    schemaSearch,
    schemaSummary,
    schemaTableInfo,
    schemaFindJoinPath,
    schemaNeighbors,
    schemaRelationships,
    schemaReferencingTables,
  ]
}
