import { runDoctor } from "../doctor.js"

export { runDoctor }

export async function runDoctorCommand(
  opts: { verbose?: boolean; fix?: boolean; testHooks?: boolean } = {}
): Promise<void> {
  return runDoctor(opts.verbose ?? false, opts.fix ?? false, opts.testHooks ?? false)
}
