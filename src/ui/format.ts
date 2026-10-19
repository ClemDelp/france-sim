const cache = new Map<number, Intl.NumberFormat>()

function formatter(digits: number): Intl.NumberFormat {
  let f = cache.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    cache.set(digits, f)
  }
  return f
}

export function num(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits))
  return formatter(digits).format(Object.is(r, -0) ? 0 : r)
}

export function signed(v: number, digits = 1): string {
  const text = num(v, digits)
  if (/^[0,\s]+$/.test(text.replace('−', ''))) {
    return text
  }
  return v > 0 ? `+${text}` : text.replace('-', '−')
}

export const pct = (v: number, digits = 1) => `${num(v * 100, digits)} %`
export const pts = (v: number, digits = 1) => `${signed(v * 100, digits)} pt`
export const bn = (v: number, digits = 0) => `${num(v, digits)} Md€`
export const sbn = (v: number, digits = 0) => `${signed(v, digits)} Md€`
