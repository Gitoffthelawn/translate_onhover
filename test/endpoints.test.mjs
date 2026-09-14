import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { chromium } from 'playwright'
import { generateUrls, parseResponse } from '../lib/apiClient.mjs'

// Google's bot detection returns 429 for plain Node/curl requests to
// translate.googleapis.com, but not for requests made from a real browser.
// So these fetches run inside an actual Chromium page - a fresh browser
// per test, not shared across the file: reusing one page for all six
// requests here made the sixth one fail outright every time (confirmed
// directly - the very same URL succeeds immediately from a brand new
// page), so whatever bot-detection signal is at play tracks per-page, not
// per-IP.
let browser

beforeEach(async () => {
  browser = await chromium.launch()
})

afterEach(async () => {
  await browser?.close()
})

async function fetchJson(url) {
  const page = await browser.newPage()
  return page.evaluate(async (u) => {
    const response = await fetch(u)
    if (!response.ok) {
      throw new Error(`Request to ${u} failed with status ${response.status}`)
    }
    return response.json()
  }, url)
}

describe('parsing google responses', () => {
  describe('url 0', function() {
    it('parses full translation response', async () => {
      await assertParsesFullTranslationResponse(0)
    })

    it('joins article and word', async function() {
      await assertJoinsArticleAndWord(0)
    })

    it('parses sentences', async function() {
      await assertParsesSentences(0)
    })
  })

  describe('url 1', function() {
    it('parses full translation response', async () => {
      await assertParsesFullTranslationResponse(1)
    })

    it('joins article and word', async function() {
      await assertJoinsArticleAndWord(1)
    })

    it('parses sentences', async function() {
      await assertParsesSentences(1)
    })
  })
})

async function assertParsesSentences(index) {
  const urls = generateUrls('gifts are yellow', { sl: 'en', tl: 'fr' })

  const data = await fetchJson(urls[index])
  const translation = parseResponse(data, 'gift')
  const expected = {
    'succeeded': true,
    'sl': 'en',
    'parsed': 'les cadeaux sont jaunes'
  }
  assert.deepStrictEqual(
    // One of the APIs starts the sentence with a capital letter, but the other one doesn't...
    JSON.parse(JSON.stringify(translation).toLowerCase()),
    expected
  )
}

async function assertJoinsArticleAndWord(index) {
  const urls = generateUrls('gift', { sl: 'en', tl: 'fr' })

  const data = await fetchJson(urls[index])
  const translation = parseResponse(data, 'gift')
  const expected = {
    'succeeded': true,
    'sl': 'en',
    'parsed': [
      {
        'pos': 'noun',
        'meanings': [
          'le cadeau',
          'le don',
          'la donation',
          'le présent',
          'le talent',
          'la prime'
        ]
      }
    ]
  }
  assert.deepStrictEqual(translation, expected)
}

async function assertParsesFullTranslationResponse(index) {
  const urls = generateUrls('cadeau', { sl: 'fr', tl: 'en' })

  const data = await fetchJson(urls[index])
  const translation = parseResponse(data, 'cadeau')
  const expected = {
    'succeeded': true,
    'sl': 'fr',
    'parsed': [
      {
        'pos': 'noun',
        'meanings': [
          'gift',
          'present',
          'treat',
          'prezzie'
        ]
      }
    ]
  }
  assert.deepStrictEqual(translation, expected)
}

