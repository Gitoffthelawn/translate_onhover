// Shared between scripts/capture-translate-fixtures.mjs (writes these files)
// and support/googleStub.mjs (reads them back) so the two can't drift.
export function fixtureName(word, sl, tl, client) {
  const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const suffix = client === 'gtx' ? '-gtx' : ''
  return `${slug}-${sl}-${tl}${suffix}`
}
