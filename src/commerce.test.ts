import { describe, expect, it } from 'vitest'
import {
  clearCheckoutAttemptToken,
  createCheckoutFingerprint,
  getCheckoutAttemptToken,
  getUnavailableCartItems,
  normalizeCartQuantity,
} from './commerce'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

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

  it('reuses checkout tokens for matching requests and rotates them for changed requests', () => {
    const storage = createMemoryStorage()
    const first = getCheckoutAttemptToken(storage, 'request-a')

    expect(getCheckoutAttemptToken(storage, 'request-a')).toBe(first)
    expect(getCheckoutAttemptToken(storage, 'request-b')).not.toBe(first)
  })

  it('clears only the completed checkout attempt', () => {
    const storage = createMemoryStorage()
    const first = getCheckoutAttemptToken(storage, 'request-a')
    const second = getCheckoutAttemptToken(storage, 'request-b')

    clearCheckoutAttemptToken(storage, first)
    expect(getCheckoutAttemptToken(storage, 'request-b')).toBe(second)

    clearCheckoutAttemptToken(storage, second)
    expect(getCheckoutAttemptToken(storage, 'request-b')).not.toBe(second)
  })

  it('fingerprints the order request consistently and changes with delivery/payment data', async () => {
    const request = {
      customerName: '  Ada Example ',
      customerEmail: 'ADA@EXAMPLE.COM ',
      phone: '+234 800 000 0000',
      shippingAddress: '  Lagos ',
      paymentMethod: 'Bank Transfer',
      items: [{ name: 'Silk Bob', quantity: 1 }, { name: 'HD Lace', quantity: 2 }],
      transferDetails: { senderName: 'Ada Example', senderBank: 'Moniepoint', transactionReference: '' },
    }
    const fingerprint = await createCheckoutFingerprint(request)
    const reordered = await createCheckoutFingerprint({ ...request, items: [...request.items].reverse() })
    const changed = await createCheckoutFingerprint({ ...request, phone: '+234 800 000 0001' })

    expect(reordered).toBe(fingerprint)
    expect(changed).not.toBe(fingerprint)
  })
})
