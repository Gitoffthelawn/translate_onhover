// Merges the raw per-realm coverage dumps written by support/coverage.mjs
// into a single Istanbul coverage report, then enforces 100% coverage per
// file.
//
// Each dump is already real Istanbul-format coverage (statementMap,
// branchMap, fnMap, with actual hit counts) keyed by original absolute
// source path - babel-plugin-istanbul bakes counters straight into the
// source at build time (see webpack.config.js's COVERAGE=true path), so
// there's no V8-coverage-to-Istanbul conversion or sourcemap remapping
// involved here, unlike an earlier version of this script that went
// through Playwright's page.coverage API + v8-to-istanbul. That approach
// turned out to be unreliable for a file the size of contentscript.js -
// V8 doesn't always hand back full block-level detail, and the merge
// silently produced a 0-branch, 0-function "100%" that meant nothing.
// Source instrumentation doesn't have that failure mode: every counter is
// real code that ran, or it isn't.
import { readdir, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const rawDir = process.env.E2E_COVERAGE_DIR
const outDir = path.resolve('coverage/e2e')

const files = await readdir(rawDir)
const map = libCoverage.createCoverageMap({})

for (const file of files) {
  const coverage = JSON.parse(await readFile(path.join(rawDir, file), 'utf8'))

  for (const [absolutePath, fileCoverage] of Object.entries(coverage)) {
    // Only our own source - node_modules (jquery, date-fns, debug, ms) got
    // instrumented too since babel-loader's exclude is only node_modules
    // for the *webpack* rule... wait, it *is* excluded there, so this is
    // just defence in depth in case that ever changes.
    if (!absolutePath.startsWith(projectRoot) || absolutePath.includes(`${path.sep}node_modules${path.sep}`)) continue

    const relativePath = '/' + path.relative(projectRoot, absolutePath)
    map.addFileCoverage({ ...fileCoverage, path: relativePath })
  }
}

await rm(outDir, { recursive: true, force: true })
const context = libReport.createContext({
  dir: outDir,
  coverageMap: map,
  // The map's keys (e.g. "/lib/languages.js") are project-root-relative;
  // without this the HTML report can't find the source to annotate.
  sourceFinder: filePath => readFileSync(path.join(projectRoot, filePath), 'utf8')
})
reports.create('text').execute(context)
reports.create('html').execute(context)
reports.create('json-summary').execute(context)
reports.create('json').execute(context)

console.log(`\nHTML report: ${path.join(outDir, 'index.html')}`)

// Enforce 100% per file.
const metrics = ['lines', 'statements', 'functions', 'branches']
let failed = false

for (const file of map.files()) {
  const summary = map.fileCoverageFor(file).toSummary()
  const short = metrics
    .filter(m => summary[m].pct !== 100)
    .map(m => `${m} ${summary[m].pct}% (${summary[m].covered}/${summary[m].total})`)

  if (short.length > 0) {
    failed = true
    console.error(`✖ ${file}: ${short.join(', ')}`)
  }
}

if (failed) {
  console.error('\ne2e coverage is below 100% on the files above.')
  process.exitCode = 1
} else {
  console.log('\n100% e2e coverage on every file. ✔')
}
