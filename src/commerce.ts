import type { CartItem } from './types'

type StockProduct = {
  name: string
  active?: boolean
  stock_quantity?: number
}

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
