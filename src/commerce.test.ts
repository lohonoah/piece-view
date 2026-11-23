import { describe, expect, it } from 'vitest'
import { getUnavailableCartItems, normalizeCartQuantity } from './commerce'

describe('commerce helpers', () => {
  it('detects missing and over-stock cart items', () => {
    const items = getUnavailableCartItems(
      [
        { name: 'Silk Bob', quantity: 3, price: 48500 },
        { name: 'Missing Piece', quantity: 1, price: 1000 },
      ],
      [
        { name: 'Silk Bob', active: true, stock_quantity: 2 },
        { name: 'Active Piece', active: true, stock_quantity: 10 },
      ],
    )

    expect(items.map(item => item.name)).toEqual(['Silk Bob', 'Missing Piece'])
  })

  it('normalizes cart quantities to the purchase limit', () => {
    expect(normalizeCartQuantity(0, 20)).toBe(1)
    expect(normalizeCartQuantity(8, 20)).toBe(8)
    expect(normalizeCartQuantity(25, 20)).toBe(20)
  })

  it('caps quantities at 20 and available stock', () => {
    expect(normalizeCartQuantity(30, 3)).toBe(3)
  })
})
