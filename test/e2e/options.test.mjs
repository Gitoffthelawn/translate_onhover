import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { launchExtension, waitForPopupText, popupStaysEmpty, gotoFixture, resetUrlLists } from './support/extension.mjs'
import { startFixtureServer } from './support/fixtureServer.mjs'
import { openOptions, setTargetLang, addExceptUrl, addOnlyUrl, saveOptions } from './support/optionsPage.mjs'
import { trackContentScriptWorld, flushPage, flushServiceWorker } from './support/coverage.mjs'

describe('options page', () => {
  let extension, siteA, siteB, page

  before(async () => {
    extension = await launchExtension()
    // Two distinct origins (different ports), needed for the
    // except_urls/only_urls scenarios below.
    siteA = await startFixtureServer()
    siteB = await startFixtureServer()

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
    await siteA.close()
    await siteB.close()
  })

  it('changing the target language changes what translations come back as', async () => {
    await gotoFixture(page, `${siteA.baseUrl}/word.html`)
    await page.click('#word')
    assert.match(await waitForPopupText(page), /cadeau/i)

    const optionsPage = await openOptions(extension.context, extension.optionsUrl)
    await setTargetLang(optionsPage, 'de')
    await saveOptions(optionsPage)
    await optionsPage.close()

    await gotoFixture(page, `${siteA.baseUrl}/word.html`)
    await page.click('#word')
    assert.match(await waitForPopupText(page), /geschenk/i)

    // put target_lang back to French for the remaining tests
    const resetPage = await openOptions(extension.context, extension.optionsUrl)
    await setTargetLang(resetPage, 'fr')
    await saveOptions(resetPage)
    await resetPage.close()
  })

  it('except_urls disables translation only on the listed origin', async () => {
    await resetUrlLists(extension)

    const optionsPage = await openOptions(extension.context, extension.optionsUrl)
    await addExceptUrl(optionsPage, siteA.baseUrl)
    await saveOptions(optionsPage)
    await optionsPage.close()

    await gotoFixture(page, `${siteA.baseUrl}/word.html`)
    await page.click('#word')
    assert.ok(await popupStaysEmpty(page), 'expected no popup on the blacklisted origin')

    await gotoFixture(page, `${siteB.baseUrl}/word.html`)
    await page.click('#word')
    assert.match(await waitForPopupText(page), /cadeau/i)
  })

  it('only_urls restricts translation to just the listed origin', async () => {
    await resetUrlLists(extension)

    const optionsPage = await openOptions(extension.context, extension.optionsUrl)
    await addOnlyUrl(optionsPage, siteA.baseUrl)
    await saveOptions(optionsPage)
    await optionsPage.close()

    await gotoFixture(page, `${siteA.baseUrl}/word.html`)
    await page.click('#word')
    assert.match(await waitForPopupText(page), /cadeau/i)

    await gotoFixture(page, `${siteB.baseUrl}/word.html`)
    await page.click('#word')
    assert.ok(await popupStaysEmpty(page), 'expected no popup on an origin not in only_urls')
  })
})
