export type BankTransferConfig = {
  bankName: string
  accountNumber: string
  accountName: string
}

export const bankTransferConfig: BankTransferConfig = {
  bankName: (import.meta.env.VITE_PIECE_VIEW_BANK_NAME || '').trim(),
  accountNumber: (import.meta.env.VITE_PIECE_VIEW_ACCOUNT_NUMBER || '').trim(),
  accountName: (import.meta.env.VITE_PIECE_VIEW_ACCOUNT_NAME || '').trim(),
}

export const bankTransferIsConfigured =
  Boolean(bankTransferConfig.bankName &&
    bankTransferConfig.accountNumber &&
    bankTransferConfig.accountName)
