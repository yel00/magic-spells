/** Lowercase, strip accents and punctuation: for comparing names from different catalogues. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Spotify titles carry edition noise ("- 2011 Remaster", "(Deluxe Edition)",
 * "(feat. X)") that other catalogues don't. Strip it before matching.
 */
export function cleanTitle(title: string): string {
  const noise = /(remaster|deluxe|expanded|edition|anniversary|bonus|version|mono|stereo|live|feat\.?|featuring|with |from |single|explicit|reissue|original|soundtrack|radio edit|mix\b)/i;
  let t = title.replace(/\s+-\s+.*$/, (m) => (noise.test(m) ? '' : m));
  t = t.replace(/\s*[([]([^)\]]*)[)\]]/g, (m, inner) => (noise.test(inner) ? '' : m));
  return t.trim() || title.trim();
}

export function sameName(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export function listNames(names: string[], max = 4): string {
  return names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more` : names.join(', ');
}
