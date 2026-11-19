export const PRODUCT_CATEGORIES = [
  'Raw human-hair bundles',
  'Ready-made human-hair wigs',
  'Closures',
  'Frontals',
  'Hair extensions and attachments',
  'Synthetic wigs',
  'Haircare and maintenance products',
  'Selected hair textures and lengths',
] as const

export type CatalogProduct = {
  id?: number
  name: string
  category?: string
  type: string
  texture?: string
  length?: string
  price: number
  oldPrice: number
  image: string
  imagePath?: string
  tag: string
  stock_quantity?: number
  active?: boolean
}

type CatalogRow = {
  id?: number
  name?: string | null
  category?: string | null
  product_type?: string | null
  texture?: string | null
  product_length?: string | null
  price?: number | string | null
  old_price?: number | string | null
  image?: string | null
  image_path?: string | null
  tag?: string | null
  stock_quantity?: number | null
  active?: boolean | null
}

export function mapCatalogProduct(row: CatalogRow): CatalogProduct {
  return {
    id: row.id,
    name: row.name || '',
    category: row.category || 'Ready-made human-hair wigs',
    type: row.product_type || '',
    texture: row.texture || '',
    length: row.product_length || '',
    price: Number(row.price || 0),
    oldPrice: Number(row.old_price ?? row.price ?? 0),
    image: row.image || '/hair/hd-lace.jpg',
    imagePath: row.image_path || '',
    tag: row.tag || '',
    stock_quantity: Number(row.stock_quantity ?? 0),
    active: row.active !== false,
  }
}
