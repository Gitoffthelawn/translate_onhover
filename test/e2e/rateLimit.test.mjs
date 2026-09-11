import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { launchExtension, waitForPopupText, gotoFixture } from './support/extension.mjs'
import { startFixtureServer } from './support/fixtureServer.mjs'
import { openOptions, setTargetLang, saveOptions } from './support/optionsPage.mjs'
import { trackContentScriptWorld, flushPage, flushServiceWorker } from './support/coverage.mjs'

describe('rate-limit backoff', () => {
  let extension, fixtures, page

  before(async () => {
    extension = await launchExtension()
    fixtures = await startFixtureServer()

    const optionsPage = await openOptions(extension.context, extension.optionsUrl)
    await setTargetLang(optionsPage, 'fr')
    await saveOptions(optionsPage)
    await optionsPage.close()

    // The only stubbed thing in the whole e2e suite: Google's translate
    // endpoints, so a real 429 is deterministic instead of needing to
    // actually get rate-limited by Google. This applies at the context
    // level so it also covers background.js's service-worker fetches, not
    // just page-initiated ones.
    await extension.context.route('**/translate_a/single**', route =>
      route.fulfill({ status: 429, body: '' })
    )

    page = await extension.context.newPage()
    await trackContentScriptWorld(page)
  })

  after(async () => {
    await flushPage(page)
    await flushServiceWorker(extension)
    await extension.close()
    await fixtures.close()
  })

  it('shows a "too many requests" message when the API returns 429', async () => {
    await gotoFixture(page, `${fixtures.baseUrl}/word.html`)
    await page.click('#word')

    const text = await waitForPopupText(page)
    assert.match(text, /too many requests/i)
  })

  // NOTE: background.js's block bookkeeping has a real bug we found while
  // writing this test - it reads blockExpiresAt/blockedErrorCount from
  // chrome.storage.local (via lib/storage.js's `localStorage` helper) but,
  // on an actual 429, writes the new blockExpiresAt to chrome.storage.sync
  // instead (a raw `chrome.storage.sync.set(...)` call in background.js,
  // bypassing the storage helpers). So the "go quiet for 30 minutes after
  // 3 blocked attempts" behavior never actually engages: every subsequent
  // request re-reads an untouched local blockExpiresAt and just hits the
  // API again. That's why this asserts the same message twice rather than
  // a suppressed/empty second response - it's pinning down real current
  // behavior, not the intended one. Once that storage mismatch is fixed,
  // this second assertion should change to expect a suppressed response.
  it('a second attempt during the "block" window still just re-hits the API today', async () => {
    await page.click('#word')

    const text = await waitForPopupText(page)
    assert.match(text, /too many requests/i)
  })
})
