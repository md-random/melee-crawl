export const idFromName = (name: string): string =>
  name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1) : w.toLowerCase())).join('')
