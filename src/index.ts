#!/usr/bin/env node

import { Command } from "commander"
import { createInterface } from "readline"
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
import { c } from "./output.js"

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
  .command("add [input...]")
  .description("Add a multi-file capability")
  .action((input) => runAdd({ input: input?.length ? input.join(" ") : undefined }))

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
  .command("remove [input...]")
  .description("Remove a capability cleanly")
  .action((input) => runRemove({ input: input?.length ? input.join(" ") : undefined }))

program
  .command("restore")
  .description("Jump to any snapshot node, restore files to that state")
  .option("--list", "Show snapshot timeline without prompting")
  .option("--id <snapshotId>", "Restore directly to a specific snapshot ID")
  .action((opts) => runRestore({ list: opts.list, id: opts.id }))

program
  .command("compare")
  .description("Diff between any two snapshot nodes to see what changed")
  .action(runCompare)

program
  .command("export")
  .description("Save current project config as a reusable template")
  .action(runExport)

// Default action — interactive menu when no command given
program.action(async () => {
  const choices = [
    { key: "1", label: "init",    desc: "Full project setup",       run: () => runInit({}) },
    { key: "2", label: "add",     desc: "Add a capability",         run: () => runAdd({}) },
    { key: "3", label: "sync",    desc: "Update after changes",     run: () => runSync({}) },
    { key: "4", label: "status",  desc: "Show current state",       run: () => runStatus() },
    { key: "5", label: "doctor",  desc: "Validate environment",     run: () => runDoctorCommand({}) },
    { key: "6", label: "restore", desc: "Time-travel to snapshot",  run: () => runRestore({}) },
    { key: "7", label: "compare", desc: "Diff between snapshots",   run: () => runCompare() },
    { key: "8", label: "remove",  desc: "Remove a capability",      run: () => runRemove({}) },
    { key: "9", label: "export",  desc: "Save as template",         run: () => runExport() },
  ]

  console.log(`\n${c.bold("Claude Setup")} ${c.dim(`v${pkg.version}`)}\n`)
  for (const ch of choices) {
    console.log(`  ${c.cyan(ch.key)}  ${ch.label.padEnd(10)} ${c.dim(ch.desc)}`)
  }
  console.log("")

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>(resolve => {
    rl.question(`  ${c.bold("Choose (1-9):")} `, a => { rl.close(); resolve(a.trim()) })
  })

  const choice = choices.find(ch => ch.key === answer || ch.label === answer.toLowerCase())
  if (!choice) {
    console.log(`\n  Invalid choice. Run ${c.cyan("npx claude-setup <command>")} or pick 1-9.\n`)
    return
  }

  console.log("")
  await choice.run()
})

program.parse()
