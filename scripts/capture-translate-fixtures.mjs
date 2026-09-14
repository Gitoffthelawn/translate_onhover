#!/usr/bin/env node
// One-time (re-run only if a test needs a new word/language combo) capture
// of real Google Translate API responses, saved under
// test/e2e/fixtures/google-responses/ and replayed by
// test/e2e/support/googleStub.mjs instead of e2e tests hitting Google for
// real. Needs an actual browser page, not a bare fetch/curl - see
// test/endpoints.test.mjs's comment on why.
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { generateUrls } from '../lib/apiClient.mjs'
import { fixtureName } from '../test/e2e/support/googleFixtureName.mjs'

const outDir = path.resolve('test/e2e/fixtures/google-responses')
await mkdir(outDir, { recursive: true })

const combos = [
  { word: 'gift', sl: 'auto', tl: 'fr' },
  { word: 'gift', sl: 'auto', tl: 'de' },
  { word: 'gift', sl: 'auto', tl: 'ar' },
  { word: 'gifts are yellow', sl: 'auto', tl: 'fr' },
  { word: 'yes', sl: 'auto', tl: 'fr' },
  { word: 'zxqvbnmghjk', sl: 'auto', tl: 'fr' },
  // typeAndTranslate.test.mjs's swap_languages test swaps de/fr to fr/de
  // before submitting this word, so the real request is fr->de, not de->fr.
  { word: 'Geschenk', sl: 'fr', tl: 'de' },
  // apiFallback.test.mjs's fallback-to-gtx test needs a real response from
  // the *second* URL (translate.googleapis.com, client=gtx) specifically,
  // not just the primary dict-chrome-ex one every other combo above hits.
  { word: 'gift', sl: 'auto', tl: 'fr', client: 'gtx', urlIndex: 1 },
]

const browser = await chromium.launch()
for (const { word, sl, tl, client, urlIndex = 0 } of combos) {
  const name = fixtureName(word, sl, tl, client)
  const url = generateUrls(word, { sl, tl })[urlIndex]
  const page = await browser.newPage()
  const data = await page.evaluate(async (u) => {
    const response = await fetch(u)
    if (!response.ok) throw new Error(`${u} failed with status ${response.status}`)
    return response.json()
  }, url)
  await page.close()
  await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2) + '\n')
  console.log(`captured ${name}`)
}
await browser.close()
