import { useEffect, useRef, useState } from 'react'
import { mapCatalogProduct, PRODUCT_CATEGORIES, type CatalogProduct } from './catalog'
import { supabase } from './lib/supabase'
import './AdminCatalog.css'

type ProductDraft = {
  id: number | null
  name: string
  category: string
  type: string
  texture: string
  length: string
  price: string
  oldPrice: string
  tag: string
  stockQuantity: string
  image: string
  imagePath: string
  active: boolean
}

type AdminCatalogProps = {
  products: CatalogProduct[]
  onProductsChange: (products: CatalogProduct[]) => void
  message: string
  setMessage: (message: string) => void
}

function emptyDraft(): ProductDraft {
  return {
    id: null,
    name: '',
    category: PRODUCT_CATEGORIES[1],
    type: '',
    texture: '',
    length: '',
    price: '',
    oldPrice: '',
    tag: '',
    stockQuantity: '0',
    image: '',
    imagePath: '',
    active: true,
  }
}

export function AdminCatalog({ products, onProductsChange, message, setMessage }: AdminCatalogProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  const refreshProducts = async () => {
    if (!supabase) return 'Catalog service is unavailable.'
    const { data, error } = await supabase
      .from('catalog_products')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return error.message
    onProductsChange((data || []).map(mapCatalogProduct))
    return null
  }

  const chooseImage = (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Images must be 5 MB or smaller.')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setMessage('')
  }

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase) return setMessage('Catalog service is unavailable.')
    if (!draft.name.trim()) return setMessage('Enter a product name.')
    if (!draft.price.trim() || !Number.isFinite(Number(draft.price)) || Number(draft.price) < 0) {
      return setMessage('Enter a valid product price.')
    }
    if (draft.oldPrice && (!Number.isFinite(Number(draft.oldPrice)) || Number(draft.oldPrice) < 0)) {
      return setMessage('Enter a valid previous price.')
    }
    if (!/^\d+$/.test(draft.stockQuantity)) return setMessage('Stock must be a whole number.')
    if (!draft.image && !imageFile) return setMessage('Upload a product image before saving.')

    setSaving(true)
    setMessage('')
    let imageUrl = draft.image
    let imagePath = draft.imagePath
    let uploadedPath = ''

    if (imageFile) {
      const extension = imageFile.type === 'image/png' ? 'png' : imageFile.type === 'image/webp' ? 'webp' : 'jpg'
      uploadedPath = `${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('catalog-images')
        .upload(uploadedPath, imageFile, {
          cacheControl: '31536000',
          contentType: imageFile.type,
          upsert: false,
        })
      if (uploadError) {
        setSaving(false)
        return setMessage(uploadError.message)
      }
      imagePath = uploadedPath
      imageUrl = supabase.storage.from('catalog-images').getPublicUrl(uploadedPath).data.publicUrl
    }

    const values = {
      name: draft.name.trim(),
      category: draft.category,
      product_type: draft.type.trim() || null,
      texture: draft.texture.trim() || null,
      product_length: draft.length.trim() || null,
      price: Number(draft.price),
      old_price: draft.oldPrice ? Number(draft.oldPrice) : null,
      image: imageUrl,
      image_path: imagePath || null,
      tag: draft.tag.trim() || null,
      stock_quantity: Number(draft.stockQuantity),
      active: draft.active,
    }

    const result = draft.id
      ? await supabase.from('catalog_products').update(values).eq('id', draft.id)
      : await supabase.from('catalog_products').insert(values)

    if (result.error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('catalog-images').remove([uploadedPath])
        setMessage(cleanupError
          ? `${result.error.message} The uploaded image could not be removed: ${cleanupError.message}`
          : result.error.message)
      } else {
        setMessage(result.error.message)
      }
      setSaving(false)
      return
    }

    let resultMessage = draft.id ? 'Product updated.' : 'Product added to the shop.'
    if (imageFile && draft.imagePath && draft.imagePath !== imagePath) {
      const { error: cleanupError } = await supabase.storage.from('catalog-images').remove([draft.imagePath])
      if (cleanupError) resultMessage = `Product saved, but the previous image could not be removed: ${cleanupError.message}`
    }

    const refreshError = await refreshProducts()
    if (refreshError) resultMessage = `Product saved, but the catalog could not be refreshed: ${refreshError}`
    setMessage(resultMessage)

    setDraft(emptyDraft())
    setImageFile(null)
    setImagePreview('')
    setSaving(false)
  }

  const editProduct = (product: CatalogProduct) => {
    setDraft({
      id: product.id || null,
      name: product.name,
      category: product.category || PRODUCT_CATEGORIES[1],
      type: product.type,
      texture: product.texture || '',
      length: product.length || '',
      price: String(product.price),
      oldPrice: product.oldPrice ? String(product.oldPrice) : '',
      tag: product.tag,
      stockQuantity: String(product.stock_quantity ?? 0),
      image: product.image,
      imagePath: product.imagePath || '',
      active: product.active !== false,
    })
    setImageFile(null)
    setImagePreview('')
    setMessage('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const deleteProduct = async (product: CatalogProduct) => {
    if (!supabase || !product.id) return setMessage('This product cannot be deleted.')
    if (!window.confirm(`Delete "${product.name}" permanently? This cannot be undone.`)) return
    if (product.imagePath) {
      await supabase.storage.from('catalog-images').remove([product.imagePath])
    }
    const { error } = await supabase.from('catalog_products').delete().eq('id', product.id)
    if (error) return setMessage(error.message)
    const refreshError = await refreshProducts()
    setMessage(refreshError || `"${product.name}" was deleted.`)
    if (draft.id === product.id) { setDraft(emptyDraft()); setImageFile(null); setImagePreview('') }
  }

  const duplicateProduct = (product: CatalogProduct) => {
    setDraft({
      id: null,
      name: `${product.name} (copy)`,
      category: product.category || PRODUCT_CATEGORIES[1],
      type: product.type,
      texture: product.texture || '',
      length: product.length || '',
      price: String(product.price),
      oldPrice: product.oldPrice ? String(product.oldPrice) : '',
      tag: product.tag,
      stockQuantity: String(product.stock_quantity ?? 0),
      image: product.image,
      imagePath: '',
      active: product.active !== false,
    })
    setImageFile(null)
    setImagePreview('')
    setMessage('Duplicated — edit the name and save to add.')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const toggleProduct = async (product: CatalogProduct) => {
    if (!supabase || !product.id) return setMessage('This product cannot be updated.')
    const { error } = await supabase
      .from('catalog_products')
      .update({ active: product.active === false })
      .eq('id', product.id)
    if (error) return setMessage(error.message)
    const refreshError = await refreshProducts()
    setMessage(refreshError || (product.active === false ? 'Product is active in the shop.' : 'Product hidden from the shop.'))
  }

  return <section className="admin-catalog">
    <form ref={formRef} className="admin-catalog-form" onSubmit={saveProduct}>
      <h2>{draft.id ? 'Edit product' : 'Add a shop product'}</h2>
      <label>Product name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required /></label>
      <label>Category<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{PRODUCT_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label>Description<input value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })} placeholder="e.g. 13×4 lace frontal" /></label>
      <div className="admin-catalog-fields">
        <label>Texture<input value={draft.texture} onChange={event => setDraft({ ...draft, texture: event.target.value })} placeholder="e.g. Body wave" /></label>
        <label>Length<input value={draft.length} onChange={event => setDraft({ ...draft, length: event.target.value })} placeholder="e.g. 18 inch" /></label>
      </div>
      <div className="admin-catalog-fields">
        <label>Price (NGN)<input type="number" min="0" step="any" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} required /></label>
        <label>Previous price (optional)<input type="number" min="0" step="any" value={draft.oldPrice} onChange={event => setDraft({ ...draft, oldPrice: event.target.value })} /></label>
      </div>
      <div className="admin-catalog-fields">
        <label>Stock quantity<input type="number" min="0" step="1" value={draft.stockQuantity} onChange={event => setDraft({ ...draft, stockQuantity: event.target.value })} required /></label>
        <label>Badge (optional)<input value={draft.tag} onChange={event => setDraft({ ...draft, tag: event.target.value })} placeholder="e.g. New arrival" /></label>
      </div>
      <label>Product image (JPG, PNG, WebP; up to 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => chooseImage(event.target.files?.[0])} /></label>
      <div className="admin-catalog-preview">{imagePreview || draft.image ? <img src={imagePreview || draft.image} alt="Product preview" /> : <span>Image preview</span>}</div>
      <label className="admin-catalog-active"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />Visible in the shop</label>
      {message && <p className="admin-message" role="status">{message}</p>}
      <div className="admin-catalog-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save product' : 'Add product'}</button>
        {draft.id && <button type="button" className="secondary" onClick={() => { setDraft(emptyDraft()); setImageFile(null); setImagePreview(''); setMessage('') }}>Cancel edit</button>}
      </div>
    </form>

    <div className="admin-catalog-list">
      <h2>Shop products ({products.length})</h2>
      {products.map(product => <article className={`admin-catalog-card ${product.active === false ? 'inactive' : ''}`} key={product.id}>
        <img src={product.image} alt="" />
        <div className="admin-catalog-card-info">
          <strong>{product.name}</strong>
          <span>{product.category || PRODUCT_CATEGORIES[1]}</span>
          <small>{[product.texture, product.length].filter(Boolean).join(' · ') || product.type}</small>
          <b>{String.fromCharCode(8358)}{product.price.toLocaleString('en-NG')} · {product.stock_quantity ?? 0} in stock
            {(product.stock_quantity ?? 0) === 0 && <span className="catalog-stock-out-badge"> · Out of stock</span>}
          </b>
        </div>
        <div className="admin-catalog-card-actions">
          <button type="button" onClick={() => editProduct(product)}>Edit</button>
          <button type="button" className="secondary" onClick={() => toggleProduct(product)}>{product.active === false ? 'Activate' : 'Hide'}</button>
          <button type="button" className="secondary" title="Duplicate product" onClick={() => duplicateProduct(product)}>Duplicate</button>
          <button type="button" className="danger" title="Delete product permanently" onClick={() => deleteProduct(product)}>Delete</button>
        </div>
      </article>)}
      {!products.length && <p className="admin-empty">No catalog products yet. Add the first product above.</p>}
    </div>
  </section>
}
