/** Ce que le jeu garde d'une visite à l'autre, dans ce navigateur seulement. Tout peut échouer (navigation privée) : on reste silencieux. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`france-sim:${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`france-sim:${key}`, JSON.stringify(value))
  } catch {
    // Stockage refusé : la progression ne sera simplement pas retenue.
  }
}
