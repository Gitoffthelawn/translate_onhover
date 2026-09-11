import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import {
  launchExtension,
  waitForPopupText,
  popupStaysEmpty,
  gotoFixture,
  openTypeAndTranslate
} from './support/extension.mjs'
import { startFixtureServer } from './support/fixtureServer.mjs'
import { openOptions, setTargetLang, saveOptions } from './support/optionsPage.mjs'
import { trackContentScriptWorld, flushPage, flushServiceWorker } from './support/coverage.mjs'

describe('type-and-translate popup', () => {
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
    await gotoFixture(page, `${fixtures.baseUrl}/word.html`)
  })

  after(async () => {
    await flushPage(page)
    await flushServiceWorker(extension)
    await extension.close()
    await fixtures.close()
  })

  it('opens, translates typed text, and closes on Escape', async () => {
    await openTypeAndTranslate(extension, page)
    await page.locator('#tat_input').waitFor()

    await page.fill('#tat_input', 'gift')
    await page.click('#tat_submit')

    const text = await waitForPopupText(page)
    assert.match(text, /cadeau/i)

    await page.keyboard.press('Escape')
    await page.locator('transover-type-and-translate-popup').waitFor({ state: 'detached' })
  })

  it('submits on Enter and closes via the close button', async () => {
    await openTypeAndTranslate(extension, page)
    await page.locator('#tat_input').waitFor()

    await page.fill('#tat_input', 'gift')
    await page.press('#tat_input', 'Enter')

    const text = await waitForPopupText(page)
    assert.match(text, /cadeau/i)

    await page.click('#tat_close')
    await page.locator('transover-type-and-translate-popup').waitFor({ state: 'detached' })
  })

  it('swap_languages swaps the from/to language selects, and the picked language is remembered', async () => {
    await openTypeAndTranslate(extension, page)
    const fromLang = page.locator('#tat_from_lang')
    const toLang = page.locator('#tat_to_lang')
    await fromLang.waitFor()

    // to_lang defaults to the target_lang option we set in before() ('fr').
    // Pick a distinct from_lang so the swap is actually observable, and
    // picking a real language (not "auto") is also what enables the swap
    // button in the first place.
    await fromLang.selectOption('de')
    assert.strictEqual(await toLang.inputValue(), 'fr')

    await page.click('#swap_languages')
    assert.strictEqual(await fromLang.inputValue(), 'fr')
    assert.strictEqual(await toLang.inputValue(), 'de')

    // Submit with this non-"auto" from-language, then reopen: the popup
    // should remember and pre-select it next time.
    await page.fill('#tat_input', 'Geschenk')
    await page.click('#tat_submit')
    await waitForPopupText(page)
    await page.keyboard.press('Escape')

    await openTypeAndTranslate(extension, page)
    await page.locator('#tat_from_lang').waitFor()
    assert.strictEqual(await page.locator('#tat_from_lang').inputValue(), 'fr')

    // and switching back to "Autodetect" is itself a real, distinct choice
    await page.locator('#tat_from_lang').selectOption('auto')
    await page.keyboard.press('Escape')
  })

  it('the "disable on this page" checkbox stops translation only on this page, and persists across reopen', async () => {
    await openTypeAndTranslate(extension, page)
    const disableOnThisPage = page.locator('#disable_on_this_page')
    await disableOnThisPage.waitFor()
    await disableOnThisPage.check()

    // toggling it also closes the popup (contentscript.js's handler for
    // this message removes it), so no need to Escape separately
    await page.locator('transover-type-and-translate-popup').waitFor({ state: 'detached' })

    await page.click('#word')
    assert.ok(await popupStaysEmpty(page), 'expected no popup once disabled on this page')

    // reopening should reflect the persisted state (attributeChangedCallback
    // reading data-disable_on_this_page back)
    await openTypeAndTranslate(extension, page)
    await page.locator('#disable_on_this_page').waitFor()
    assert.strictEqual(await page.locator('#disable_on_this_page').isChecked(), true)

    // revert and confirm translation actually works again, so this test
    // doesn't leak a blacklisted origin into the rest of the file
    await page.locator('#disable_on_this_page').uncheck()
    await page.locator('transover-type-and-translate-popup').waitFor({ state: 'detached' })
    await page.click('#word')
    assert.match(await waitForPopupText(page), /cadeau/i)
  })

  it('the "disable everywhere" checkbox stops translation on the page', async () => {
    await openTypeAndTranslate(extension, page)
    const disableEverywhere = page.locator('#disable_everywhere')
    await disableEverywhere.waitFor()
    await disableEverywhere.check()

    // toggling it also closes the popup (contentscript.js's handler for
    // this message removes it), so no need to Escape separately
    await page.locator('transover-type-and-translate-popup').waitFor({ state: 'detached' })

    await page.click('#word')
    assert.ok(await popupStaysEmpty(page), 'expected no popup once disabled everywhere')

    // revert, so a later test file launching against a stale profile
    // wouldn't be affected (each test file launches its own fresh profile
    // today, but this keeps the file correct on its own terms too)
    await openTypeAndTranslate(extension, page)
    await page.locator('#disable_everywhere').waitFor()
    await page.locator('#disable_everywhere').uncheck()
  })
})
