import { runDoctor } from "../doctor.js"

export { runDoctor }

export async function runDoctorCommand(opts: { verbose?: boolean } = {}): Promise<void> {
  return runDoctor(opts.verbose ?? false)
}
