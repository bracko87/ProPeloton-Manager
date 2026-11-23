/**
 * Conservative, read-only diagnostic for standalone missing SQL terminators.
 *
 * PostgreSQL's pg_dump style validly writes closing "$function$" on one line
 * and its ";" on the next. Opening delimiters also lack a semicolon. Neither
 * is an error. Report ONLY unambiguous cases where a fresh SQL statement
 * immediately follows the unterminated delimiter, as seen in the Nations
 * migrations. The local Docker bootstrap remains the authoritative parser.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const folder = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const suspicious = []
let files = 0
const newStatement = /^(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER|VIEW|TABLE|INDEX)|ALTER\s+|GRANT\s+|REVOKE\s+|COMMENT\s+|DROP\s+|DO\s+\$)/i

for (const file of readdirSync(folder).filter(name => name.endsWith('.sql')).sort()) {
  files++
  const lines = readFileSync(folder + '/' + file, 'utf8').split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*\$(?:function|body|proc)\$\s*$/i.test(lines[index])) continue
    let next = index + 1
    while (next < lines.length && (!lines[next].trim() || lines[next].trim().startsWith('--'))) next++
    if (next === lines.length || lines[next].trim() === ';') continue
    if (newStatement.test(lines[next].trim())) {
      suspicious.push(file + ':' + (index + 1) + ': missing semicolon before next SQL statement')
    }
  }
}
if (suspicious.length) {
  console.error('Found ' + suspicious.length + ' strong missing-terminator candidates across ' + files + ' migration files:')
  suspicious.slice(0,40).forEach(x => console.error(x))
  if (suspicious.length > 40) console.error('...remaining candidates suppressed to keep CI readable')
  process.exitCode = 1
} else {
  console.log('PASS: ' + files + ' migrations have no immediate unclosed function delimiter followed by a new SQL statement.')
}
