import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Runs BEFORE any test module is imported so tests never touch real state.
const testHome = mkdtempSync(join(tmpdir(), 'dsh-queue-merge-test-'))
process.env.DSH_HOME = testHome
