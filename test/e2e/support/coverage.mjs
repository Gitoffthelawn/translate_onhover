import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Opt-in: normal `test:e2e` runs don't pay the coverage-collection
// overhead or build with instrumentation, only `test:e2e:coverage` does
// (see scripts/test-e2e-coverage.sh, which builds with COVERAGE=true and
// sets this).
const outDir = process.env.E2E_COVERAGE_DIR
export const coverageEnabled = !!outDir

// The dev build instruments source with babel-plugin-istanbul when
// COVERAGE=true (see webpack.config.js), which writes real coverage
// counters to `globalThis.__coverage__` as instrumented code runs -
// already in Istanbul's own format, keyed by original absolute source
// path, no sourcemap remapping needed on our end.
//
// The catch: contentscript.js runs in the content script's own isolated
// JS world, a separate realm from the page - invisible to plain
// page.evaluate(), which only reaches the main world. popup.js/tat_popup.js
// (injected as real <script> tags) and options_script.js *do* run in the
// main world. So each page needs two reads: page.evaluate() for the main
// world, and a CDP session targeting the isolated world's execution
// context for the content script.
const isolatedContextIdByPage = new WeakMap()
const cdpSessionByPage = new WeakMap()

// Call once, right after creating any page that will navigate to a real
// fixture page (so the content script - and its isolated world - runs
// there). Must be called before the first navigation so the context-created
// event isn't missed.
export async function trackContentScriptWorld(page) {
  if (!coverageEnabled) return

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Runtime.enable')
  cdp.on('Runtime.executionContextCreated', ({ context }) => {
    if (context.auxData?.type === 'isolated' && context.origin.startsWith('chrome-extension://')) {
      isolatedContextIdByPage.set(page, context.id)
    }
  })
  cdpSessionByPage.set(page, cdp)
}

// Reads and dumps coverage for a page tracked via trackContentScriptWorld
// (both its main world and, if present, the content script's isolated
// world). Call this before every navigation on that page - a fresh
// document is a fresh JS realm, so whatever hasn't been dumped yet is lost
// the moment you navigate away.
export async function dumpPageCoverage(page) {
  if (!coverageEnabled || page.isClosed()) return

  await dumpMainWorld(page)

  const cdp = cdpSessionByPage.get(page)
  const contextId = isolatedContextIdByPage.get(page)
  if (!cdp || contextId === undefined) return

  const result = await cdp.send('Runtime.evaluate', {
    expression: 'globalThis.__coverage__ || null',
    contextId,
    returnByValue: true
  }).catch(() => null)
  await writeCoverage(result?.result?.value)
}

// For pages with no content-script isolated world to worry about (options
// pages - options.html is the extension's own page, so options_script.js
// just runs in that page's one and only world). Wraps close() so short-lived
// pages that get opened and closed repeatedly don't need their own explicit
// flush call at every site.
export async function trackPage(page) {
  if (!coverageEnabled) return page

  const originalClose = page.close.bind(page)
  page.close = async (...args) => {
    await dumpMainWorld(page)
    return originalClose(...args)
  }
  return page
}

// For a trackContentScriptWorld page that's never explicitly closed (torn
// down via context.close() instead) - call this before that happens.
export async function flushPage(page) {
  await dumpPageCoverage(page)
}

// background.js runs in the MV3 service worker - yet another separate
// realm, but Playwright's Worker.evaluate() reaches it directly (no CDP
// gymnastics needed there, unlike the content script's isolated world).
// Call once per test file, before closing the extension.
export async function flushServiceWorker(extension) {
  if (!coverageEnabled) return
  const coverage = await extension.serviceWorker.evaluate(() => globalThis.__coverage__ || null).catch(() => null)
  await writeCoverage(coverage)
}

async function dumpMainWorld(page) {
  const coverage = await page.evaluate(() => globalThis.__coverage__ || null).catch(() => null)
  await writeCoverage(coverage)
}

async function writeCoverage(coverage) {
  if (!coverage || Object.keys(coverage).length === 0) return
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, `${randomUUID()}.json`), JSON.stringify(coverage))
}
