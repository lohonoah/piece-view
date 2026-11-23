export type PaymentMethod = 'Pay on delivery' | 'Bank Transfer' | 'Paystack'
export type PaymentStatus =
  | 'Not required'
  | 'Awaiting confirmation'
  | 'Pending'
  | 'Paid'
  | 'Failed'

export type OrderStatus =
  | 'Pending'
  | 'Processing'
  | 'Out for delivery'
  | 'Completed'
  | 'Cancelled'

export type CartItem = {
  id?: number
  name: string
  type?: string
  texture?: string
  length?: string
  price: number
  image?: string
  quantity: number
  stock_quantity?: number
  active?: boolean
}

export type TransferDetails = {
  senderName: string
  senderBank: string
  transactionReference: string
}
