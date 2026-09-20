import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const localeRoot = path.join(root, 'src', 'i18n', 'locales')
const languagesSource = fs.readFileSync(
  path.join(root, 'src', 'i18n', 'languages.ts'),
  'utf8',
)
const languages = [...languagesSource.matchAll(/\bcode:\s*['"]([^'"]+)['"]/g)].map(
  match => match[1],
)

if (languages.length === 0 || !languages.includes('en')) {
  throw new Error('Could not resolve supported languages from src/i18n/languages.ts')
}

const strictNamespaces = ['premiumCenter']
const requiredNavigationKeys = ['premiumCenter', 'descriptions.premiumCenter']

const premiumSourceFiles = [
  'src/pages/dashboard/PremiumCommandCenter.tsx',
  'src/pages/dashboard/Training.tsx',
  'src/pages/dashboard/equipment/components/EquipmentOverviewTab.tsx',
  'src/pages/dashboard/Finance.tsx',
  'src/pages/dashboard/Transfers.tsx',
  'src/pages/dashboard/RacePreparation.tsx',
  'src/pages/dashboard/Overview.tsx',
  'src/features/squad/components/RiderProfilePage.tsx',
]

const forbiddenVisibleEnglish = [
  'Premium Training Templates',
  'Premium Equipment Templates',
  'Premium Financial Simulator',
  'Premium Sponsor Intelligence',
  'Premium Transfer Command',
  'Premium Race Strategy Lab',
  'Premium Rider Development Lab',
  'Premium Command Summary',
  'Open Command Center',
  'Unlock Premium tools',
  'See Premium season analytics',
  'No training templates saved yet. Create one in Premium Command Center.',
  'No equipment templates saved yet.',
  'Flat</option>',
  'Hilly</option>',
  'Mountain</option>',
  'Cobbles</option>',
  'Time trial</option>',
  'Free core view',
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function flatten(value, prefix = '', out = new Map()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }

  out.set(prefix, value)
  return out
}

function readPath(obj, dottedPath) {
  return dottedPath.split('.').reduce(
    (value, key) =>
      value && typeof value === 'object' && key in value ? value[key] : undefined,
    obj,
  )
}

function placeholders(value) {
  if (typeof value !== 'string') return []
  return [...value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g)]
    .map(match => match[1])
    .sort()
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function hasTranslationKey(obj, key) {
  if (readPath(obj, key) !== undefined) return true

  // i18next plural calls use the base key while locale JSON stores
  // suffixed variants such as key_one / key_other.
  const parts = key.split('.')
  const leaf = parts.pop()
  const parent = parts.length > 0 ? readPath(obj, parts.join('.')) : obj

  return Boolean(
    parent &&
      typeof parent === 'object' &&
      leaf &&
      (Object.prototype.hasOwnProperty.call(parent, `${leaf}_one`) ||
        Object.prototype.hasOwnProperty.call(parent, `${leaf}_other`)),
  )
}

const errors = []
const warnings = []

for (const namespace of strictNamespaces) {
  const englishPath = path.join(localeRoot, 'en', `${namespace}.json`)
  const english = readJson(englishPath)
  const englishFlat = flatten(english)

  for (const language of languages) {
    const filePath = path.join(localeRoot, language, `${namespace}.json`)

    if (!fs.existsSync(filePath)) {
      errors.push(`[${language}] Missing namespace file: ${namespace}.json`)
      continue
    }

    let locale
    try {
      locale = readJson(filePath)
    } catch (error) {
      errors.push(`[${language}] Invalid JSON in ${namespace}.json: ${error.message}`)
      continue
    }

    const localeFlat = flatten(locale)

    for (const [key, englishValue] of englishFlat) {
      if (!localeFlat.has(key)) {
        errors.push(`[${language}] Missing ${namespace} key: ${key}`)
        continue
      }

      const localeValue = localeFlat.get(key)

      if (typeof localeValue !== typeof englishValue) {
        errors.push(
          `[${language}] Type mismatch for ${namespace}.${key}: expected ${typeof englishValue}, got ${typeof localeValue}`,
        )
        continue
      }

      const englishPlaceholders = placeholders(englishValue)
      const localePlaceholders = placeholders(localeValue)

      if (!arraysEqual(englishPlaceholders, localePlaceholders)) {
        errors.push(
          `[${language}] Placeholder mismatch for ${namespace}.${key}: expected {${englishPlaceholders.join(', ')}}, got {${localePlaceholders.join(', ')}}`,
        )
      }

      if (
        language !== 'en' &&
        typeof localeValue === 'string' &&
        localeValue.trim() === '' &&
        String(englishValue).trim() !== ''
      ) {
        errors.push(`[${language}] Empty translation for ${namespace}.${key}`)
      }
    }

    for (const key of localeFlat.keys()) {
      if (!englishFlat.has(key)) {
        warnings.push(`[${language}] Extra ${namespace} key not present in English: ${key}`)
      }
    }
  }
}

for (const language of languages) {
  const navigationPath = path.join(localeRoot, language, 'navigation.json')
  const navigation = readJson(navigationPath)

  for (const key of requiredNavigationKeys) {
    if (!hasTranslationKey(navigation, key)) {
      errors.push(`[${language}] Missing navigation translation: ${key}`)
    }
  }
}

const englishPremium = readJson(path.join(localeRoot, 'en', 'premiumCenter.json'))

for (const relativePath of premiumSourceFiles) {
  const filePath = path.join(root, relativePath)
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing audited source file: ${relativePath}`)
    continue
  }

  const source = fs.readFileSync(filePath, 'utf8')

  for (const phrase of forbiddenVisibleEnglish) {
    if (source.includes(phrase) && !source.includes(`premiumCenter:${phrase}`)) {
      errors.push(
        `Hardcoded Premium UI copy found in ${relativePath}: "${phrase}". Move it to premiumCenter.json.`,
      )
    }
  }

  const qualifiedKeyRegex = /t\(\s*['"]premiumCenter:([^'"]+)['"]/g
  for (const match of source.matchAll(qualifiedKeyRegex)) {
    if (!hasTranslationKey(englishPremium, match[1])) {
      errors.push(
        `Unknown Premium translation key in ${relativePath}: premiumCenter:${match[1]}`,
      )
    }
  }

  if (relativePath.endsWith('/PremiumCommandCenter.tsx')) {
    // Require a standalone translation function call. This avoids false
    // positives from method names ending in "t", e.g. params.get('tab').
    const localKeyRegex = /(?:^|[^A-Za-z0-9_.$])t\(\s*['"]([^:'"]+)['"]/gm
    for (const match of source.matchAll(localKeyRegex)) {
      if (!hasTranslationKey(englishPremium, match[1])) {
        errors.push(
          `Unknown premiumCenter key in ${relativePath}: ${match[1]}`,
        )
      }
    }

    const tabKeys = [
      'summary',
      'strategy',
      'season',
      'transfers',
      'finance',
      'sponsors',
      'development',
      'templates',
    ]

    for (const tab of tabKeys) {
      if (!hasTranslationKey(englishPremium, `tabs.${tab}`)) {
        errors.push(`Missing dynamic premiumCenter tab key: tabs.${tab}`)
      }
    }
  }
}

if (warnings.length > 0) {
  console.warn('\nTranslation warnings:')
  for (const warning of warnings) console.warn(`  - ${warning}`)
}

if (errors.length > 0) {
  console.error('\nTranslation validation failed:')
  for (const error of errors) console.error(`  - ${error}`)
  console.error(`\n${errors.length} translation problem(s) found.\n`)
  process.exit(1)
}

console.log(
  `Translation validation passed: ${languages.length} languages, ${strictNamespaces.length} strict namespace(s), ${premiumSourceFiles.length} Premium source files audited.`,
)
