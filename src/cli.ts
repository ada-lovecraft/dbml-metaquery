/**
 * CLI for dbml-metaquery.
 *
 * Usage:
 *   dbml-metaquery <dbml-path> find-path <from> <to>
 *   dbml-metaquery <dbml-path> info <table>
 *   dbml-metaquery <dbml-path> neighbors <table>
 *   dbml-metaquery <dbml-path> refs-to <table>
 *   dbml-metaquery <dbml-path> rels <table>
 *   dbml-metaquery <dbml-path> search <query>
 *   dbml-metaquery <dbml-path> summary
 *   dbml-metaquery <dbml-path> tables
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { DbmlGraph } from "./graph"

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log("Usage: dbml-metaquery <dbml-path> <command> [args]")
  console.log()
  console.log("Parse DBML into a navigable graph with rich metadata.")
  console.log()
  console.log("Commands:")
  console.log("  find-path <from> <to>  Find shortest FK path between tables")
  console.log("  info <table>           Show table metadata (note, columns, group)")
  console.log("  neighbors <table>      Show tables directly connected via FK")
  console.log("  refs-to <table>        Show tables that reference this table")
  console.log("  rels <table>           Show all FK relationships for a table")
  console.log("  search <query>         Search table/column names and notes")
  console.log("  summary                Show schema overview (groups and table counts)")
  console.log("  tables                 List all table names")
  process.exit(0)
}

const dbmlPath = resolve(args[0]!)
if (!existsSync(dbmlPath)) {
  console.error(`DBML file not found: ${dbmlPath}`)
  process.exit(1)
}

const command = args[1]
if (!command) {
  console.error("No command provided. Use --help for usage.")
  process.exit(1)
}

const dbml = readFileSync(dbmlPath, "utf-8")
const graph = new DbmlGraph(dbml)
const cmdArgs = args.slice(2)

switch (command) {
  case "tables": {
    const tables = graph.getTables()
    console.log(`${tables.length} tables:\n`)
    for (const t of tables) {
      console.log(`  ${t}`)
    }
    break
  }

  case "summary": {
    const summary = graph.getSummary()
    const total = summary.reduce((n, g) => n + g.tableCount, 0)
    console.log(`${total} tables in ${summary.length} groups:\n`)
    for (const group of summary) {
      const color = graph.getGroupColor(group.groupName)
      const colorStr = color ? ` \x1b[2m${color}\x1b[0m` : ""
      console.log(`  \x1b[1m${group.groupName}\x1b[0m (${group.tableCount})${colorStr}`)
      for (const t of group.tables) {
        const noteStr = t.note ? ` \x1b[2m— ${t.note}\x1b[0m` : ""
        console.log(`    ${t.name}${noteStr}`)
      }
      console.log()
    }
    break
  }

  case "info": {
    if (!cmdArgs[0]) {
      console.error("Usage: dbml-metaquery <dbml-path> info <table>")
      process.exit(1)
    }
    const table = graph.getTable(cmdArgs[0])
    if (!table) {
      console.error(`Table "${cmdArgs[0]}" not found`)
      process.exit(1)
    }

    console.log(`\x1b[1m${table.name}\x1b[0m`)
    if (table.note) {
      console.log(`  ${table.note}`)
    }
    const color = graph.getTableColor(table.name)
    if (color) {
      console.log(`  \x1b[2mcolor:\x1b[0m ${color}`)
    }
    const group = graph.getGroup(table.name)
    if (group) {
      console.log(`  \x1b[2mgroup:\x1b[0m ${group.name} (${group.tables.length} tables)`)
    }
    console.log()
    console.log(`  \x1b[2mColumns:\x1b[0m`)
    for (const col of table.columns) {
      let line = `    ${col.name} \x1b[2m${col.type}\x1b[0m`
      if (col.fk) {
        line += ` \x1b[33m-> ${col.fk.table}.${col.fk.column}\x1b[0m`
      }
      if (col.note) {
        line += `\n      \x1b[2m${col.note}\x1b[0m`
      }
      console.log(line)
    }
    break
  }

  case "neighbors": {
    if (!cmdArgs[0]) {
      console.error("Usage: dbml-metaquery <dbml-path> neighbors <table>")
      process.exit(1)
    }
    if (!graph.getTable(cmdArgs[0])) {
      console.error(`Table "${cmdArgs[0]}" not found`)
      process.exit(1)
    }

    const n = graph.getNeighbors(cmdArgs[0])
    console.log(`\x1b[1m${cmdArgs[0]}\x1b[0m\n`)

    if (n.parents.length > 0) {
      console.log(`  \x1b[2mParents (tables I reference):\x1b[0m`)
      for (const p of n.parents) {
        console.log(`    \x1b[33m${p.via}\x1b[0m -> ${p.table}`)
      }
      console.log()
    }

    if (n.children.length > 0) {
      console.log(`  \x1b[2mChildren (tables that reference me):\x1b[0m`)
      for (const c of n.children) {
        console.log(`    ${c.table}.\x1b[33m${c.via}\x1b[0m`)
      }
      console.log()
    }

    if (n.parents.length === 0 && n.children.length === 0) {
      console.log("  No FK connections.")
    }
    break
  }

  case "refs-to": {
    if (!cmdArgs[0]) {
      console.error("Usage: dbml-metaquery <dbml-path> refs-to <table>")
      process.exit(1)
    }
    const refs = graph.getReferencingTables(cmdArgs[0])

    if (refs.length === 0) {
      console.log(`No tables reference "${cmdArgs[0]}"`)
    } else {
      console.log(`${refs.length} tables reference \x1b[1m${cmdArgs[0]}\x1b[0m:\n`)
      for (const r of refs) {
        console.log(`  ${r.table}.\x1b[33m${r.column}\x1b[0m -> ${cmdArgs[0]}.\x1b[33m${r.myColumn}\x1b[0m`)
      }
    }
    break
  }

  case "rels": {
    if (!cmdArgs[0]) {
      console.error("Usage: dbml-metaquery <dbml-path> rels <table>")
      process.exit(1)
    }
    const rels = graph.getRelationships(cmdArgs[0])
    if (rels.length === 0) {
      console.log(`No relationships found for "${cmdArgs[0]}"`)
    } else {
      console.log(`${rels.length} relationships for "${cmdArgs[0]}":\n`)
      for (const r of rels) {
        const direction =
          r.childTable === cmdArgs[0]
            ? `  ${r.childTable}.${r.childColumn} -> ${r.parentTable}.${r.parentColumn}`
            : `  ${r.parentTable}.${r.parentColumn} <- ${r.childTable}.${r.childColumn}`
        console.log(direction)
      }
    }
    break
  }

  case "search": {
    if (!cmdArgs[0]) {
      console.error("Usage: dbml-metaquery <dbml-path> search <query>")
      process.exit(1)
    }
    const { searchResults } = graph.searchSchema(cmdArgs[0])

    if (searchResults.length === 0) {
      console.log(`No matches for "${cmdArgs[0]}"`)
    } else {
      console.log(`${searchResults.length} matches for "\x1b[1m${cmdArgs[0]}\x1b[0m":\n`)
      for (const r of searchResults) {
        switch (r.match) {
          case "table_name":
            console.log(`  \x1b[1m${r.table}\x1b[0m \x1b[2m(table)\x1b[0m`)
            break
          case "table_note":
            console.log(`  \x1b[1m${r.table}\x1b[0m \x1b[2m(note: ${r.text})\x1b[0m`)
            break
          case "column_name":
            console.log(`  ${r.table}.\x1b[33m${r.column}\x1b[0m \x1b[2m(column)\x1b[0m`)
            break
          case "column_note":
            console.log(`  ${r.table}.\x1b[33m${r.column}\x1b[0m \x1b[2m(note: ${r.text})\x1b[0m`)
            break
        }
      }
    }
    break
  }

  case "find-path": {
    const [fromTable, toTable] = cmdArgs
    if (!fromTable || !toTable) {
      console.error("Usage: dbml-metaquery <dbml-path> find-path <from> <to>")
      process.exit(1)
    }

    try {
      const path = graph.findPath(fromTable, toTable)

      if (path === null) {
        console.log(`No path found from "${fromTable}" to "${toTable}"`)
        process.exit(1)
      }

      if (path.length === 0) {
        console.log(`"${fromTable}" and "${toTable}" are the same table.`)
        break
      }

      console.log(
        `Path from \x1b[1m${fromTable}\x1b[0m to \x1b[1m${toTable}\x1b[0m (${path.length} hop${path.length > 1 ? "s" : ""}):\n`,
      )

      for (const step of path) {
        console.log(
          `  ${step.from.table}.\x1b[33m${step.from.column}\x1b[0m -> ${step.to.table}.\x1b[33m${step.to.column}\x1b[0m`,
        )
      }

      console.log()
      console.log("\x1b[2mSQL:\x1b[0m")
      console.log(`  \x1b[2mFROM\x1b[0m ${fromTable}`)
      for (const step of path) {
        console.log(
          `  \x1b[2mJOIN\x1b[0m ${step.to.table} \x1b[2mON\x1b[0m ${step.from.table}.${step.from.column} = ${step.to.table}.${step.to.column}`,
        )
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
    break
  }

  default:
    console.error(`Unknown command: ${command}. Use --help for usage.`)
    process.exit(1)
}
