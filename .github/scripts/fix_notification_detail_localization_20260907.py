from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / 'src' / 'pages' / 'dashboard' / 'NotificationsPage.tsx'
text = path.read_text(encoding='utf-8')

old_import = "import { localizeNotificationTypeCodeLabel } from '@/features/notifications/notificationLocalization'"
new_import = """import {
  localizeNotificationNarrative,
  localizeNotificationTypeCodeLabel,
  localizeNotificationValue,
} from '@/features/notifications/notificationLocalization'"""
if old_import not in text:
    raise SystemExit('NotificationsPage.tsx localization import anchor not found')
text = text.replace(old_import, new_import, 1)

anchor = """function localizeAdvisorNotificationRuntimeText(value: unknown, t: any): string {
  const text = String(value ?? '').trim()
  if (!text) return text
"""
if anchor not in text:
    raise SystemExit('NotificationsPage.tsx advisor runtime localizer anchor not found')

# Add a second layer after the existing advisor-specific function. The shared
# notification localizer understands persisted legacy English, dynamic i18n
# templates, and semantic fallbacks. Advisor-specific translations keep first
# priority so their richer wording is preserved.
function_end = """  return text
}


function formatAdvisorDisplayValue(value: unknown): string {
"""
replacement_end = """  return text
}

function localizeNotificationRuntimeText(
  value: unknown,
  item: NotificationItem,
  t: any
): string {
  const text = String(value ?? '').trim()
  if (!text) return text

  const advisorSpecific = localizeAdvisorNotificationRuntimeText(text, t)
  if (advisorSpecific !== text) return advisorSpecific

  const narrative = localizeNotificationNarrative(text, item)
  if (narrative && narrative !== text) return narrative

  const localizedValue = localizeNotificationValue(text, item)
  return localizedValue || text
}


function formatAdvisorDisplayValue(value: unknown): string {
"""
if function_end not in text:
    raise SystemExit('NotificationsPage.tsx advisor runtime localizer end anchor not found')
text = text.replace(function_end, replacement_end, 1)

# The Sports Director expanded panel was reading payload.summary directly,
# bypassing the shared notification localization that already normalizes the
# collapsed row. Route the same text through the shared runtime layer.
old_summary = "{localizeAdvisorNotificationRuntimeText(advisorPayload.summary || item.message, t)}"
new_summary = "{localizeNotificationRuntimeText(advisorPayload.summary || item.message, item, t)}"
if old_summary not in text:
    raise SystemExit('Sports Director summary anchor not found')
text = text.replace(old_summary, new_summary, 1)

# Recommendations appear in several advisor panels. Translate known exact
# advisor wording first; any remaining persisted English goes through the
# notification semantic/dynamic-template fallback instead of leaking raw text.
text = text.replace(
    "localizeAdvisorNotificationRuntimeText(recommendation, t)",
    "localizeNotificationRuntimeText(recommendation, item, t)",
)

# Notification-derived values in advisor cards can also be backend enum/label
# strings. Keep names/dates untouched, but allow shared value localization to
# translate statuses and fixed phrases.
old_value = ": formatAdvisorDisplayValue(value)}"
new_value = ": localizeNotificationValue(formatAdvisorDisplayValue(value), item)}"
# Only replace the card-render expression(s); if upstream layout changes, fail
# loudly rather than silently losing the coverage.
if old_value not in text:
    raise SystemExit('Advisor summary value anchor not found')
text = text.replace(old_value, new_value)

path.write_text(text, encoding='utf-8')
print('Expanded notification detail localization coverage applied.')
