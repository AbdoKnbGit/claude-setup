#!/usr/bin/env node

import { Command } from "commander"
import { createRequire } from "module"
import { runInit } from "./commands/init.js"
import { runAdd } from "./commands/add.js"
import { runSync } from "./commands/sync.js"
import { runStatus } from "./commands/status.js"
import { runDoctorCommand } from "./commands/doctor.js"
import { runRemove } from "./commands/remove.js"
import { runRestore } from "./commands/restore.js"
import { runCompare } from "./commands/compare.js"
import { runExport } from "./commands/export.js"

const require = createRequire(import.meta.url)
const pkg = require("../package.json")

const program = new Command()

program
  .name("claude-setup")
  .description("Setup layer for Claude Code — reads your project, writes command files, Claude Code does the rest")
  .version(pkg.version)

program
  .command("init")
  .description("Full project setup — new or existing")
  .option("--dry-run", "Preview what would be written without writing")
  .option("--template <path>", "Apply a template instead of scanning (local path or URL)")
  .action((opts) => runInit({ dryRun: opts.dryRun, template: opts.template }))

program
  .command("add")
  .description("Add a multi-file capability")
  .action(runAdd)

program
  .command("sync")
  .description("Update setup after project changes")
  .option("--dry-run", "Preview changes without writing")
  .option("--budget <tokens>", "Override token budget for this run", parseInt)
  .action((opts) => runSync({ dryRun: opts.dryRun, budget: opts.budget }))

program
  .command("status")
  .description("Show current setup state (instant, no file reads)")
  .action(runStatus)

program
  .command("doctor")
  .description("Validate environment — OS, MCP, hooks, env vars, skills")
  .option("-v, --verbose", "Show passing checks too")
  .option("--fix", "Auto-fix issues where possible (model override, OS format, re-snapshot)")
  .option("--test-hooks", "Run every hook once in sandbox, report pass/fail")
  .action((opts) => runDoctorCommand({
    verbose: opts.verbose,
    fix: opts.fix,
    testHooks: opts.testHooks,
  }))

program
  .command("remove")
  .description("Remove a capability cleanly")
  .action(runRemove)

// Feature A: Time-travel snapshot commands
program
  .command("restore")
  .description("Jump to any snapshot node, restore files to that state")
  .action(runRestore)

program
  .command("compare")
  .description("Diff between any two snapshot nodes to see what changed")
  .action(runCompare)

// Feature H: Config template export
program
  .command("export")
  .description("Save current project config as a reusable template")
  .action(runExport)

// Default action when no command given
program.action(() => runInit({}))
program.parse()
