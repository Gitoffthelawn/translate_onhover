import { describe, it } from 'node:test'
import assert from 'node:assert'
import { generateUrls, parseResponse } from '../lib/apiClient.mjs'

describe('generateUrls', () => {
  it('builds both API urls with sl, tl and the encoded, trimmed word', () => {
    const urls = generateUrls('  hello world  ', { sl: 'en', tl: 'fr' })

    assert.strictEqual(urls.length, 2)
    urls.forEach(url => {
      assert.match(url, /sl=en&tl=fr&q=hello%20world/)
    })
    assert.match(urls[0], /^https:\/\/clients5\.google\.com\/translate_a\/single\?/)
    assert.match(urls[1], /^https:\/\/translate\.googleapis\.com\/translate_a\/single\?/)
  })
})

describe('parseResponse', () => {
  it('parses a dictionary response, joining article and word', () => {
    const data = {
      src: 'en',
      dict: [
        {
          pos: 'noun',
          entry: [
            { word: 'cadeau', previous_word: 'le' },
            { word: 'présent', previous_word: 'un' },
            { word: 'don' }
          ]
        }
      ]
    }

    assert.deepStrictEqual(parseResponse(data, 'gift'), {
      succeeded: true,
      sl: 'en',
      parsed: [
        {
          pos: 'noun',
          meanings: ['le cadeau', 'un présent', 'don']
        }
      ]
    })
  })

  it('joins an apostrophe-ending article directly onto the word', () => {
    const data = {
      src: 'en',
      dict: [
        {
          pos: 'noun',
          entry: [{ word: 'ami', previous_word: 'l\'' }]
        }
      ]
    }

    assert.deepStrictEqual(parseResponse(data, 'friend').parsed, [
      { pos: 'noun', meanings: ['l\'ami'] }
    ])
  })

  it('parses a sentence translation when there is no dict entry', () => {
    const data = {
      src: 'en',
      sentences: [{ trans: 'les cadeaux ' }, { trans: 'sont jaunes' }]
    }

    assert.deepStrictEqual(parseResponse(data, 'gifts are yellow'), {
      succeeded: true,
      sl: 'en',
      parsed: 'les cadeaux  sont jaunes'
    })
  })

  it('fails when there is neither a dict nor a sentences field', () => {
    assert.deepStrictEqual(parseResponse({}, 'gift'), {
      succeeded: false,
      sl: undefined,
      parsed: undefined
    })
  })

  it('fails when the "translation" is just the input echoed back', () => {
    const data = { sentences: [{ trans: 'Gift' }] }

    assert.deepStrictEqual(parseResponse(data, 'gift'), {
      succeeded: false,
      sl: undefined,
      parsed: undefined
    })
  })
})
