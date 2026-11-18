/** Piece View mark: three flowing strands of hair. */
const STRANDS = [
  'M9 7 C15 11 7 16 13 20.5 C16 22.5 15.5 25 13.5 26',
  'M13.5 6 C19.5 10 11.5 15.5 17.5 20 C20.5 22 20 24.5 18 25.5',
  'M18 7 C24 11 16 16 22 20.5 C24.5 22.3 24.3 24.2 22.8 25',
]

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        {STRANDS.map(d => <path key={d} d={d} />)}
      </svg>
    </span>
  )
}
