// The lib/*.js source files use extensionless relative imports (e.g.
// `import { languages } from './languages'`), which webpack resolves fine
// but Node's native ESM resolver rejects. This hook retries a failed
// relative-import resolution with a `.js` extension appended, so the
// existing source can be imported unmodified from `node --test`.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
      return await nextResolve(`${specifier}.js`, context)
    }
    throw err
  }
}
