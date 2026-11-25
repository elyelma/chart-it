import { describe, expect, it } from 'vitest'
import { classify, decimalsFromStep } from '../src/data/util'

describe('decimalsFromStep', () => {
  it('reads exchange step strings', () => {
    expect(decimalsFromStep('0.01000000')).toBe(2)
    expect(decimalsFromStep('0.00001000')).toBe(5)
    expect(decimalsFromStep('0.5')).toBe(1)
    expect(decimalsFromStep('0.25')).toBe(2)
    expect(decimalsFromStep('1')).toBe(0)
    expect(decimalsFromStep('1.00000000')).toBe(0)
    expect(decimalsFromStep('10')).toBe(0)
    expect(decimalsFromStep('0.00000015')).toBe(8)
  })

  it('reads numbers and exponent notation', () => {
    expect(decimalsFromStep(0.01)).toBe(2)
    expect(decimalsFromStep(1)).toBe(0)
    expect(decimalsFromStep(0.0001)).toBe(4)
    expect(decimalsFromStep(1e-8)).toBe(8)
    expect(decimalsFromStep('1e-8')).toBe(8)
    expect(decimalsFromStep('1E-10')).toBe(10)
  })

  // 1.5e-7 === 0.00000015 needs 8 decimals; the exponent branch ignores the
  // mantissa's own decimals and returns 7. Only hit when a number (or an
  // exponent string) with a non-integer mantissa is passed; current callers
  // pass plain decimal strings from the APIs, so impact is low.
  it('exponent notation keeps the mantissa decimals (fixed)', () => {
    expect(decimalsFromStep(1.5e-7)).toBe(8)
  })
})

describe('classify', () => {
  it('finds known bases case-insensitively', () => {
    expect(classify('GOLD', 'stock')).toMatchObject({ category: 'metal', name: 'Oro' })
    expect(classify('gold', 'stock')).toMatchObject({ category: 'metal', name: 'Oro' })
    expect(classify('xyz100', 'stock')).toMatchObject({ category: 'index' })
    expect(classify('CL', 'stock')).toMatchObject({ category: 'energy', name: 'Petróleo WTI' })
    expect(classify('EUR', 'stock')).toMatchObject({ category: 'fx', name: 'EUR/USD' })
    expect(classify('XAU', 'crypto').aliases).toContain('XAUUSD')
  })

  it('falls back to the given category and the base as name', () => {
    expect(classify('NVDA', 'stock')).toEqual({ category: 'stock', name: 'NVDA' })
    expect(classify('PAXG', 'metal')).toEqual({ category: 'metal', name: 'PAXG' })
  })

  it('does not match inherited object keys', () => {
    // KNOWN is a plain object literal: "constructor", "toString"… must not be treated as known markets.
    expect(classify('constructor', 'stock')).toEqual({ category: 'stock', name: 'constructor' })
  })
})
