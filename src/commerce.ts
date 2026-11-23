import type { CartItem } from './types'

const CHECKOUT_ATTEMPT_STORAGE_KEY = 'pieceview_checkout_attempt'

type StockProduct = {
  name: string
  active?: boolean
  stock_quantity?: number
}

type CheckoutFingerprintInput = {
  customerName: string
  customerEmail: string
  phone: string
  shippingAddress: string
  paymentMethod: string
  items: Array<{ name: string; quantity: number }>
  transferDetails?: {
    senderName: string
    senderBank: string
    transactionReference: string
  } | null
}

type StoredCheckoutAttempt = {
  fingerprint: string
  token: string
}

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function normalizeCartQuantity(quantity: number, stockQuantity: number): number {
  const stock = Math.max(0, Math.min(Math.floor(stockQuantity), 20))
  const requested = Math.floor(quantity)
  if (stock === 0) return 0
  if (!Number.isFinite(requested) || requested < 1) return 1
  return Math.min(requested, stock)
}

export function getUnavailableCartItems(
  cart: CartItem[],
  catalog: StockProduct[],
): CartItem[] {
  return cart.filter(item => {
    const product = catalog.find(row =>
      row.active !== false && row.name === item.name
    )
    if (!product) return true
    return (item.quantity || 1) > normalizeCartQuantity(
      item.quantity || 1,
      product.stock_quantity ?? 0,
    )
  })
}

export async function createCheckoutFingerprint(input: CheckoutFingerprintInput): Promise<string> {
  const canonicalInput = {
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim().toLowerCase(),
    phone: input.phone.trim(),
    shippingAddress: input.shippingAddress.trim(),
    paymentMethod: input.paymentMethod,
    items: [...input.items]
      .map(item => ({ name: item.name, quantity: item.quantity || 1 }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    transferDetails: input.transferDetails
      ? {
          senderName: input.transferDetails.senderName.trim(),
          senderBank: input.transferDetails.senderBank.trim(),
          transactionReference: input.transferDetails.transactionReference.trim(),
        }
      : null,
  }
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalInput))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function getCheckoutAttemptToken(
  storage: SessionStorageLike,
  fingerprint: string,
): string {
  const stored = storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
  if (stored) {
    try {
      const attempt = JSON.parse(stored) as Partial<StoredCheckoutAttempt>
      if (attempt.fingerprint === fingerprint && typeof attempt.token === 'string') {
        return attempt.token
      }
    } catch {
      storage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
    }
  }

  const token = crypto.randomUUID()
  storage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify({ fingerprint, token }))
  return token
}

export function clearCheckoutAttemptToken(
  storage: SessionStorageLike,
  token: string,
): void {
  const stored = storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
  if (!stored) return

  try {
    const attempt = JSON.parse(stored) as Partial<StoredCheckoutAttempt>
    if (attempt.token === token) storage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
  } catch {
    storage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
  }
}
