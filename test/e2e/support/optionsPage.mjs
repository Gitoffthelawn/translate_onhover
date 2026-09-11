// Small helpers for driving the real options.html UI (lib/options_script.js),
// so the e2e suite exercises that code too instead of poking chrome.storage
// directly.

import { trackPage } from './coverage.mjs'

export async function openOptions(context, optionsUrl) {
  const page = await context.newPage()
  await trackPage(page)
  await page.goto(optionsUrl)

  // options_script.js's load() sequentially awaits ~9 chrome.storage.local
  // reads before it even binds the Save button's click handler. Interacting
  // before it settles is a real race: e.g. selecting a value and clicking
  // Save can lose to load()'s own late `$('#field').val(await Options.x())`
  // call landing after. `#reverse_lang` is populated by the third of those
  // awaits (fill_reverse_lang), so waiting for it plus a small margin for
  // the handful of remaining ones is a reliable-enough readiness signal.
  await page.waitForFunction(() => document.querySelector('#reverse_lang').options.length > 1)
  await page.waitForTimeout(200)

  return page
}

export async function showMoreOptions(optionsPage) {
  if (await optionsPage.locator('#more_options').isHidden()) {
    await optionsPage.click('#more_options_link')
  }
}

export async function setTargetLang(optionsPage, code) {
  await optionsPage.selectOption('#target_lang', code)
}

export async function setTranslateBy(optionsPage, value) {
  await optionsPage.selectOption('#translate_by', value)
}

export async function addExceptUrl(optionsPage, urlPattern) {
  await showMoreOptions(optionsPage)
  await optionsPage.locator('#exc_urls_table .except_url_input').last().fill(urlPattern)
}

export async function addOnlyUrl(optionsPage, urlPattern) {
  await showMoreOptions(optionsPage)
  await optionsPage.locator('#only_urls_table .only_url_input').last().fill(urlPattern)
}

// Clicks Save and gives the (unawaited, fire-and-forget from the click
// handler's point of view) chrome.storage.local.set() calls time to land
// before the caller navigates away or asserts on stored state.
export async function saveOptions(optionsPage) {
  await optionsPage.click('#save_button')
  await optionsPage.waitForTimeout(500)
}
