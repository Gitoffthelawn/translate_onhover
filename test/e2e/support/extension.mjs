import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dumpPageCoverage } from './coverage.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../../../dist')

// Loading an unpacked MV3 extension requires a headed browser: Chromium's
// "new" headless mode never starts the extension's service worker (tested
// directly - it just hangs). CI runs this headed under Xvfb.
export async function launchExtension() {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'transover-e2e-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreHTTPSErrors: true, // the fixture server uses a throwaway self-signed cert
    args: [
      `--disable-extensions-except=${distPath}`,
      `--load-extension=${distPath}`,
    ],
  })

  const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
  const extensionId = serviceWorker.url().split('/')[2]

  return {
    context,
    serviceWorker,
    extensionId,
    optionsUrl: `chrome-extension://${extensionId}/options.html`,
    async close() {
      await context.close()
      await rm(userDataDir, { recursive: true, force: true })
    }
  }
}

// Navigates to a fixture page and gives the content script's own (async)
// options load a moment to resolve. contentscript.js only arms its
// mousestop-scheduling timer once `options` has loaded, so a single
// mousemove/click fired immediately after `goto` can race ahead of it and
// be silently dropped.
export async function gotoFixture(page, url, { settle = 300 } = {}) {
  // A fresh document is a fresh JS realm - whatever coverage the content
  // script on the current page accumulated has to be read out now, or it's
  // gone the moment we navigate away.
  await dumpPageCoverage(page)
  await page.goto(url)
  await page.waitForTimeout(settle)
}

// Reads the current translation popup's text out of its shadow DOM.
export async function getPopupText(page) {
  return page.evaluate(() => {
    const popup = document.querySelector('transover-popup')
    const main = popup && popup.shadowRoot && popup.shadowRoot.querySelector('main')
    return main ? main.innerText.trim() : null
  })
}

// Waits for a (non-empty) translation popup to appear and returns its text.
export async function waitForPopupText(page, { timeout = 15000 } = {}) {
  await page.waitForFunction(() => {
    const popup = document.querySelector('transover-popup')
    const main = popup && popup.shadowRoot && popup.shadowRoot.querySelector('main')
    return !!(main && main.innerText.trim())
  }, undefined, { timeout })
  return getPopupText(page)
}

// Opens the type-and-translate popup on `page`. In real usage this is
// triggered by clicking the toolbar icon, which Playwright can't do (that's
// browser chrome, not page content) - background.js's
// browserAction.onClicked listener is just one line
// (`chrome.tabs.sendMessage(tab.id, 'open_type_and_translate')`), so this
// calls that same line directly from the service worker instead. `page`
// must be the focused tab (manifest.json has no host permission for the
// fixture server's origin, so tabs.query can't filter by url - it has to
// find it via activeTab instead).
export async function openTypeAndTranslate(extension, page) {
  await page.bringToFront()
  await extension.serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    chrome.tabs.sendMessage(tab.id, 'open_type_and_translate')
  })
}

// Test-isolation helper: resets the except_urls/only_urls lists directly via
// the background service worker's real chrome.storage API, so each options
// scenario starts from a clean slate without needing to reopen the options
// UI just to clear rows it didn't add.
export async function resetUrlLists(extension) {
  await extension.serviceWorker.evaluate(
    () => chrome.storage.local.set({ except_urls: [], only_urls: [] })
  )
}

// Asserts no popup shows up within `wait` ms - used for negative cases
// (except_urls, disabled everywhere, etc.) where we expect nothing to
// happen. Removes any popup left over from an earlier translation in the
// same test file first: contentscript.js only clears an existing popup as
// a side effect of a real mousemove or a new translation, and this isn't
// testing that mechanism - relying on it just to get to a clean starting
// point made this flaky (a stale popup masquerading as "a new one showed
// up"). Direct removal sidesteps that; the DOM is shared across the page's
// worlds, so it doesn't matter that the element was created by the content
// script's isolated world.
export async function popupStaysEmpty(page, { wait = 2000 } = {}) {
  await page.evaluate(() => {
    document.querySelectorAll('transover-popup').forEach(el => el.remove())
  })
  await page.waitForTimeout(wait)
  return (await getPopupText(page)) === null
}
