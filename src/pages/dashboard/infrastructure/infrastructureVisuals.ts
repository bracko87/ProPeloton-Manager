import type { FacilityKey } from './infrastructureTypes'

/**
 * Final uploaded artwork belongs here. Each facility can define one image per
 * supported level. Until a URL is supplied, the UI uses a lightweight
 * generated fallback so level progression can already be tested.
 */
export const facilityLevelImageUrls: Partial<
  Record<FacilityKey, Partial<Record<number, string>>>
> = {
  club_house: {
    0: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Club%20House%20lvl%200.png',
    1: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Club%20House%20lvl%201.png',
    2: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Club%20House%20lvl%202.png',
    3: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Club%20House%20lvl%203.png',
    4: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Club%20House%20lvl%204.png',
  },
  training_center: {
    0: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/training%20centre%20lvl%200.png',
    1: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/training%20centre%20lvl%201.png',
    2: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/training%20centre%20lvl%202.png',
    3: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/training%20centre%20lvl%203.png',
    4: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/training%20centre%20lvl%204.png',
    5: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/training%20centre%20lvl%205.png',
  },
  medical_center: {},
  youth_academy: {},
  mechanics_workshop: {},
  scouting_office: {},
}

const themes: Record<FacilityKey, { name: string; wall: string; roof: string; accent: string }> = {
  club_house: { name: 'Club House', wall: '#496b86', roof: '#263746', accent: '#f2c14e' },
  training_center: { name: 'Training Center', wall: '#3974bf', roof: '#1f426b', accent: '#7dd3fc' },
  medical_center: { name: 'Medical Center', wall: '#e5e7eb', roof: '#64748b', accent: '#dc2626' },
  youth_academy: { name: 'Youth Academy', wall: '#c9983d', roof: '#765421', accent: '#f8e08e' },
  mechanics_workshop: { name: 'Mechanics Workshop', wall: '#64748b', roof: '#334155', accent: '#f59e0b' },
  scouting_office: { name: 'Scouting Office', wall: '#536273', roof: '#263241', accent: '#38bdf8' },
}

function clampLevel(level: number, maxLevel: number): number {
  return Math.min(
    Math.max(0, Math.floor(Number(maxLevel) || 0)),
    Math.max(0, Math.floor(Number(level) || 0)),
  )
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function facilityDetail(key: FacilityKey, level: number): string {
  if (level <= 0) return ''

  switch (key) {
    case 'training_center':
      return '<ellipse cx="400" cy="354" rx="180" ry="35" fill="none" stroke="#f8fafc" stroke-width="7" opacity=".85"/><ellipse cx="400" cy="354" rx="142" ry="24" fill="none" stroke="#64748b" stroke-width="3" opacity=".65"/>'
    case 'medical_center':
      return '<rect x="382" y="185" width="36" height="106" rx="4" fill="#dc2626"/><rect x="347" y="220" width="106" height="36" rx="4" fill="#dc2626"/>'
    case 'youth_academy':
      return '<circle cx="278" cy="348" r="13" fill="none" stroke="#334155" stroke-width="4"/><circle cx="326" cy="348" r="13" fill="none" stroke="#334155" stroke-width="4"/><path d="M278 348 L295 324 L326 348 L305 348 L291 334" fill="none" stroke="#334155" stroke-width="4" stroke-linecap="round"/>'
    case 'mechanics_workshop':
      return '<rect x="267" y="261" width="70" height="67" rx="3" fill="#263241"/><rect x="365" y="261" width="70" height="67" rx="3" fill="#263241"/><rect x="463" y="261" width="70" height="67" rx="3" fill="#263241"/>'
    case 'scouting_office':
      return '<path d="M400 160 L400 83 M372 111 Q400 86 428 111 M352 132 Q400 85 448 132" fill="none" stroke="#38bdf8" stroke-width="5" stroke-linecap="round"/><circle cx="400" cy="83" r="6" fill="#38bdf8"/>'
    case 'club_house':
    default:
      return '<rect x="375" y="274" width="50" height="56" rx="3" fill="#263746"/><rect x="389" y="291" width="22" height="39" rx="2" fill="#f2c14e" opacity=".85"/>'
  }
}

/**
 * Temporary 800x450 progression artwork. The viewBox/camera stays identical
 * at every level. Level 0 is an empty site; later levels add visible mass,
 * wings, upper floors and facility-specific detail.
 */
export function getGeneratedFacilityLevelImage(
  key: FacilityKey,
  level: number,
  maxLevel: number,
): string {
  const safeLevel = clampLevel(level, maxLevel)
  const safeMax = Math.max(1, Math.floor(Number(maxLevel) || 1))
  const theme = themes[key]
  const width = 245 + safeLevel * 43
  const height = 88 + safeLevel * 19
  const x = 400 - width / 2
  const y = 330 - height

  const windows = Array.from({ length: safeLevel * 3 }, (_, i) => {
    const px = x + 28 + ((i + 1) * (width - 70)) / (safeLevel * 3 + 1)
    const py = y + 35 + (i % 2) * 31
    return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="21" height="17" rx="2" fill="#dbeafe" opacity=".9"/>`
  }).join('')

  const levelZero = `
    <path d="M182 343 L400 263 L618 343 L400 403 Z" fill="#b9ca8d" stroke="#758b59" stroke-width="3" stroke-dasharray="12 8"/>
    <path d="M230 344 L400 283 L570 344" fill="none" stroke="#eef5df" stroke-width="4"/>
    <rect x="335" y="290" width="130" height="38" rx="7" fill="#fff" stroke="#d1d5db"/>
    <text x="400" y="314" text-anchor="middle" font-size="13" font-family="Arial,sans-serif" fill="#64748b">EMPTY SITE</text>`

  const built = `
    <ellipse cx="400" cy="351" rx="267" ry="61" fill="#8ca66f" opacity=".48"/>
    ${safeLevel >= 2 ? `<rect x="${x - 72}" y="${y + 56}" width="105" height="${height - 56}" rx="5" fill="${theme.wall}" opacity=".9"/>` : ''}
    ${safeLevel >= 3 ? `<rect x="${x + width - 30}" y="${y + 49}" width="115" height="${height - 49}" rx="5" fill="${theme.wall}" opacity=".9"/>` : ''}
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${theme.wall}"/>
    <path d="M${x - 12} ${y + 5} L400 ${y - 54} L${x + width + 12} ${y + 5} Z" fill="${theme.roof}"/>
    ${safeLevel >= 4 ? `<rect x="${x + 72}" y="${y - 46}" width="${Math.max(120, width - 144)}" height="52" rx="5" fill="${theme.wall}"/><path d="M${x + 55} ${y - 46} L400 ${y - 79} L${x + width - 55} ${y - 46} Z" fill="${theme.roof}"/>` : ''}
    ${safeLevel >= 5 ? `<rect x="${x + width + 35}" y="${y + 31}" width="90" height="130" rx="8" fill="${theme.roof}"/><rect x="${x + width + 54}" y="${y + 55}" width="52" height="20" rx="3" fill="${theme.accent}"/>` : ''}
    ${windows}
    ${facilityDetail(key, safeLevel)}`

  return toDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#f8fafc"/></linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfdbad"/><stop offset="1" stop-color="#9fb87d"/></linearGradient>
      </defs>
      <rect width="800" height="450" fill="url(#sky)"/>
      <path d="M0 210 Q180 155 355 207 T800 198 L800 450 L0 450 Z" fill="#becdaa"/>
      <path d="M0 264 Q210 208 390 252 T800 240 L800 450 L0 450 Z" fill="url(#ground)"/>
      <path d="M0 414 L800 340 L800 450 L0 450 Z" fill="#7f8994" opacity=".8"/>
      <path d="M0 429 L800 358" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="25 20"/>
      ${safeLevel === 0 ? levelZero : built}
      <rect x="22" y="20" width="205" height="57" rx="10" fill="#0f172a" opacity=".8"/>
      <text x="40" y="43" font-size="14" font-family="Arial,sans-serif" font-weight="700" fill="#fff">${theme.name}</text>
      <text x="40" y="64" font-size="12" font-family="Arial,sans-serif" fill="#e2e8f0">Level ${safeLevel} / ${safeMax}</text>
      <rect x="22" y="83" width="205" height="5" rx="2.5" fill="#e2e8f0" opacity=".65"/>
      <rect x="22" y="83" width="${Math.max(8, 205 * (safeLevel / safeMax))}" height="5" rx="2.5" fill="${theme.accent}"/>
    </svg>`)
}

export function getFacilityLevelImage(key: FacilityKey, level: number, maxLevel: number): string {
  const safeLevel = clampLevel(level, maxLevel)
  return facilityLevelImageUrls[key]?.[safeLevel] || getGeneratedFacilityLevelImage(key, safeLevel, maxLevel)
}

export function getFacilityFallbackImage(key: FacilityKey, level: number, maxLevel: number): string {
  return getGeneratedFacilityLevelImage(key, level, maxLevel)
}
