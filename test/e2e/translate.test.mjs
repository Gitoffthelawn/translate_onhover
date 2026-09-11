import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { launchExtension, waitForPopupText, gotoFixture } from './support/extension.mjs'
import { startFixtureServer } from './support/fixtureServer.mjs'
import { openOptions, setTargetLang, setTranslateBy, saveOptions } from './support/optionsPage.mjs'
import { trackContentScriptWorld, flushPage, flushServiceWorker } from './support/coverage.mjs'

describe('translate flows', () => {
  let extension, fixtures, page

  before(async () => {
    extension = await launchExtension()
    fixtures = await startFixtureServer()

    const optionsPage = await openOptions(extension.context, extension.optionsUrl)
    await setTargetLang(optionsPage, 'fr')
    await saveOptions(optionsPage)
    await optionsPage.close()

    page = await extension.context.newPage()
    await trackContentScriptWorld(page)
  })

  after(async () => {
    await flushPage(page)
    await flushServiceWorker(extension)
    await extension.close()
    await fixtures.close()
  })

  it('translates on click (the default translate_by)', async () => {
    await gotoFixture(page, `${fixtures.baseUrl}/word.html`)
    await page.click('#word')

    const text = await waitForPopupText(page)
    assert.match(text, /cadeau/i)
  })

  it('translates on hover when translate_by is "point"', async () => {
    const optionsPage = await openOptions(extension.context, extension.optionsUrl)
    await setTranslateBy(optionsPage, 'point')
    await saveOptions(optionsPage)
    await optionsPage.close()

    await gotoFixture(page, `${fixtures.baseUrl}/word.html`)
    const box = await page.locator('#word').boundingBox()
    // The previous test already left the (virtual) mouse sitting on this
    // exact word - move away first so the move below is a real change and
    // actually dispatches a mousemove for the content script to see.
    await page.mouse.move(0, 0)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

    const text = await waitForPopupText(page)
    assert.match(text, /cadeau/i)

    // put translate_by back to the default for the remaining tests
    const resetPage = await openOptions(extension.context, extension.optionsUrl)
    await setTranslateBy(resetPage, 'click')
    await saveOptions(resetPage)
    await resetPage.close()
  })

  it('translates a text selection', async () => {
    await gotoFixture(page, `${fixtures.baseUrl}/sentence.html`)
    const box = await page.locator('#sentence').boundingBox()

    // A drag doesn't reliably produce a real text selection every time
    // under CI's slower, more contended timing - retry rather than let a
    // missed drag surface as a 15s "no popup ever showed up" timeout below,
    // which wouldn't say why.
    let selectedText = ''
    for (let attempt = 0; attempt < 5 && !selectedText; attempt++) {
      await page.mouse.move(box.x + 5, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2, { steps: 20 })
      await page.mouse.up()
      selectedText = await page.evaluate(() => window.getSelection().toString())
    }
    assert.ok(selectedText, 'drag-select never produced a text selection')

    const text = await waitForPopupText(page)
    assert.match(text, /jaunes/i)
  })

  it('shows "Oops" for input Google just echoes back untranslated', async () => {
    await gotoFixture(page, `${fixtures.baseUrl}/oops.html`)
    await page.click('#word')

    const text = await waitForPopupText(page)
    assert.match(text, /Oops/)
  })
})
