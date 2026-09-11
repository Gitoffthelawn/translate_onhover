import { describe, it } from 'node:test'
import assert from 'node:assert'
import { escape_html, renderError, formatTranslation } from '../lib/transover_utils.js'

describe('escape_html', () => {
  it('escapes <, > and &', () => {
    assert.strictEqual(
      escape_html('<b>Tom & Jerry</b>'),
      '&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;'
    )
  })

  it('leaves text without special characters untouched', () => {
    assert.strictEqual(escape_html('cadeau'), 'cadeau')
  })
})

describe('renderError', () => {
  it('embeds the message into the error markup', () => {
    const html = renderError('Something broke')
    assert.match(html, /Error!/)
    assert.match(html, /Something broke/)
  })
})

describe('formatTranslation', () => {
  const options = { show_from_lang: true }

  it('renders a single translated string, html-escaped', () => {
    const html = formatTranslation('<script>evil</script>', { sl: 'fr', tl: 'en' }, options)
    assert.match(html, /&lt;script&gt;evil&lt;\/script&gt;/)
    assert.doesNotMatch(html, /<script>/)
  })

  it('renders pos/meanings blocks for dictionary translations', () => {
    const translation = [
      { pos: 'noun', meanings: ['le cadeau', 'le don'] }
    ]
    const html = formatTranslation(translation, { sl: 'en', tl: 'fr' }, options)
    assert.match(html, /<strong>noun<\/strong>/)
    assert.match(html, /le cadeau, le don/)
  })

  it('truncates meanings to 5 and appends an ellipsis', () => {
    const translation = [
      { pos: 'noun', meanings: ['one', 'two', 'three', 'four', 'five', 'six'] }
    ]
    const html = formatTranslation(translation, { sl: 'en', tl: 'fr' }, options)
    assert.match(html, /one, two, three, four, five\.\.\./)
    assert.doesNotMatch(html, /six/)
  })

  it('does not add an ellipsis when there are 5 or fewer meanings', () => {
    const translation = [
      { pos: 'noun', meanings: ['one', 'two'] }
    ]
    const html = formatTranslation(translation, { sl: 'en', tl: 'fr' }, options)
    assert.doesNotMatch(html, /\.\.\./)
  })

  it('omits the pos label when a block has none', () => {
    const translation = [{ pos: undefined, meanings: ['foo'] }]
    const html = formatTranslation(translation, { sl: 'en', tl: 'fr' }, { show_from_lang: false })
    assert.strictEqual(html, '<div class="pos_translation ">foo</div>')
  })

  it('adds the rtl class when translating into an rtl language', () => {
    const html = formatTranslation('hello', { sl: 'en', tl: 'ar' }, options)
    assert.match(html, /class="pos_translation  rtl"/)
  })

  it('does not add the rtl class when translating into an ltr language', () => {
    const html = formatTranslation('bonjour', { sl: 'en', tl: 'fr' }, options)
    assert.doesNotMatch(html, /rtl/)
  })

  it('appends the source language when show_from_lang is true', () => {
    const html = formatTranslation('bonjour', { sl: 'fr', tl: 'en' }, { show_from_lang: true })
    assert.match(html, /translated from/)
    assert.match(html, /French/)
  })

  it('omits the source language block when show_from_lang is false', () => {
    const html = formatTranslation('bonjour', { sl: 'fr', tl: 'en' }, { show_from_lang: false })
    assert.doesNotMatch(html, /translated from/)
  })

  it('omits the source language block when sl is not a known language code', () => {
    const html = formatTranslation('bonjour', { sl: 'auto', tl: 'en' }, { show_from_lang: true })
    assert.doesNotMatch(html, /translated from/)
  })
})
