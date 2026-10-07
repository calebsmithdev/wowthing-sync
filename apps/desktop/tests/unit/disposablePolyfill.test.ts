// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const polyfill = readFileSync(new URL('../../public/polyfills/disposable.js', import.meta.url), 'utf8')

describe('disposal compatibility for older webviews', () => {
  it('defines a stable symbol before Resource classes capture it', () => {
    const symbols = Object.assign((description: string) => Symbol(description), {
      asyncDispose: undefined as symbol | undefined,
    })
    runInNewContext(polyfill, { Symbol: symbols })
    const disposalSymbol = symbols.asyncDispose!
    expect(typeof disposalSymbol).toBe('symbol')

    // A later polyfill execution must preserve the key captured by Resource.
    const resource = { [disposalSymbol]: () => 'closed' }
    runInNewContext(polyfill, { Symbol: symbols })
    expect(resource[symbols.asyncDispose!]!()).toBe('closed')
  })

  it('preserves a native disposal symbol', () => {
    const nativeSymbol = Symbol('native asyncDispose')
    const symbols = { asyncDispose: nativeSymbol }
    runInNewContext(polyfill, { Symbol: symbols })
    expect(symbols.asyncDispose).toBe(nativeSymbol)
  })
})
