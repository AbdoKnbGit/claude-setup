#!/usr/bin/env node

import { Command } from "commander"
import { createRequire } from "module"
import { runInit } from "./commands/init.js"
import { runAdd } from "./commands/add.js"
import { runSync } from "./commands/sync.js"
import { runStatus } from "./commands/status.js"
import { runDoctorCommand } from "./commands/doctor.js"
import { runRemove } from "./commands/remove.js"

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
  .action((opts) => runInit({ dryRun: opts.dryRun }))

program
  .command("add")
  .description("Add a multi-file capability")
  .action(runAdd)

program
  .command("sync")
  .description("Update setup after project changes")
  .option("--dry-run", "Preview changes without writing")
  .action((opts) => runSync({ dryRun: opts.dryRun }))

program
  .command("status")
  .description("Show current setup state (instant, no file reads)")
  .action(runStatus)

program
  .command("doctor")
  .description("Validate environment — OS, MCP, hooks, env vars, skills")
  .option("-v, --verbose", "Show passing checks too")
  .action((opts) => runDoctorCommand({ verbose: opts.verbose }))

program
  .command("remove")
  .description("Remove a capability cleanly")
  .action(runRemove)

// Default action when no command given
program.action(() => runInit({}))
program.parse()
