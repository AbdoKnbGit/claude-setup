#!/usr/bin/env node

import { Command } from "commander"
import { createRequire } from "module"
import { runInit } from "./commands/init.js"
import { runAdd } from "./commands/add.js"
import { runSync } from "./commands/sync.js"
import { runStatus } from "./commands/status.js"
import { runDoctor } from "./commands/doctor.js"
import { runRemove } from "./commands/remove.js"

const require = createRequire(import.meta.url)
const pkg = require("../package.json")

const program = new Command()

program
  .name("claude-stack")
  .description("Setup layer for Claude Code")
  .version(pkg.version)

program.command("init").description("Full project setup — new or existing").action(runInit)
program.command("add").description("Add a multi-file capability").action(runAdd)
program.command("sync").description("Update setup after project changes").action(runSync)
program.command("status").description("Show current setup (instant)").action(runStatus)
program.command("doctor").description("Validate environment").action(runDoctor)
program.command("remove").description("Remove a capability cleanly").action(runRemove)

program.action(runInit)
program.parse()
