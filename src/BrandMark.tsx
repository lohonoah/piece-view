/** Piece View monogram: a "V" whose left stroke doubles as the stem of a "P". */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 8 L16 24 L23 8" />
        <path d="M9 8 H14.5 a4.25 4.25 0 0 1 0 8.5 H12.7" />
      </svg>
    </span>
  )
}
