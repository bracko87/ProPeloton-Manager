from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)

p = Path('src/pages/dashboard/Overview.tsx')
text = p.read_text(encoding='utf-8')

# Keep raw English feed values for the existing sort/dedupe heuristics; localize only after that logic runs.
text = replace_once(
    text,
    '''function buildTeamNewsItems(
  alerts: AlertItem[],
  feed: FeedItem[],
  currentGameDateLabel: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): OverviewNewsListItem[] {''',
    '''function buildTeamNewsItems(
  alerts: AlertItem[],
  feed: FeedItem[],
  currentGameDateLabel: string,
): OverviewNewsListItem[] {''',
    'restore team-news signature',
)
text = replace_once(
    text,
    '''      subtitle: t("news.actionMayBeRequired"),
      timeLabel: getOverviewCurrentGameDateTimeLabel(currentGameDateLabel),
      href,
      level: alert.level,
      sourceLabel: "Team",
      expandedText: t("news.actionMayBeRequired"),
      linkLabel: t("news.openRelatedPage"),''',
    '''      subtitle: "Action may be required from your team management dashboard.",
      timeLabel: getOverviewCurrentGameDateTimeLabel(currentGameDateLabel),
      href,
      level: alert.level,
      sourceLabel: "Team",
      expandedText: buildTeamNewsExpandedText(
        alert.label,
        "Action may be required from your team management dashboard.",
      ),
      linkLabel: getNewsLinkLabel(href, "Team"),''',
    'restore raw alert presentation',
)
text = replace_once(
    text,
    '''  const feedItems: OverviewNewsListItem[] = feed.map((item) => {
    const href = normalizeDashboardHref(item.href);
    const localizedCopy = localizeOverviewTeamFeedCopy(item.title, item.subtitle, t);

    return {
      id: `feed:${item.id}`,
      title: localizedCopy.title,
      subtitle: localizedCopy.subtitle,
      timeLabel: getOverviewGameTimeLabel(item.timeLabel, currentGameDateLabel),
      href,
      level: item.level,
      sourceLabel: "Team",
      expandedText: localizedCopy.subtitle,
      linkLabel: t("news.openRelatedPage"),
    };
  });''',
    '''  const feedItems: OverviewNewsListItem[] = feed.map((item) => {
    const href = normalizeDashboardHref(item.href);

    return {
      id: `feed:${item.id}`,
      title: item.title,
      subtitle: buildWorldNewsSubtitle(item),
      timeLabel: getOverviewGameTimeLabel(item.timeLabel, currentGameDateLabel),
      href,
      level: item.level,
      sourceLabel: "Team",
      expandedText: buildTeamNewsExpandedText(item.title, item.subtitle),
      linkLabel: getNewsLinkLabel(href, "Team"),
    };
  });''',
    'restore raw feed presentation',
)
text = replace_once(
    text,
    'const teamNewsItems = buildTeamNewsItems(alerts, feed, currentGameDateLabel, t);',
    'const teamNewsItems = buildTeamNewsItems(alerts, feed, currentGameDateLabel);',
    'restore team-news call',
)

anchor = '''  const combinedItems = buildSortedDedupedNewsBoardItems(
    teamNewsItems,
    worldNewsItems,
    currentGameDateLabel,
    7,
  );

  return ('''
replacement = '''  const combinedItems = buildSortedDedupedNewsBoardItems(
    teamNewsItems,
    worldNewsItems,
    currentGameDateLabel,
    7,
  );

  const displayItems = combinedItems.map((item) => {
    if (item.sourceLabel !== "Team") return item;

    const localizedCopy = localizeOverviewTeamFeedCopy(item.title, item.subtitle, t);
    const copyChanged =
      localizedCopy.title !== item.title || localizedCopy.subtitle !== item.subtitle;
    const isGenericAttention =
      item.subtitle === "Action may be required from your team management dashboard.";

    return {
      ...item,
      title: localizedCopy.title,
      subtitle: isGenericAttention
        ? t("news.actionMayBeRequired")
        : localizedCopy.subtitle,
      expandedText: copyChanged
        ? localizedCopy.subtitle
        : isGenericAttention
          ? t("news.actionMayBeRequired")
          : item.expandedText,
      linkLabel: item.href ? t("news.openRelatedPage") : item.linkLabel,
    };
  });

  return ('''
text = replace_once(text, anchor, replacement, 'add post-sort display localization')
text = replace_once(text, '{combinedItems.length}/7', '{displayItems.length}/7', 'news count')
text = replace_once(text, '{combinedItems.length > 0 ? (', '{displayItems.length > 0 ? (', 'news nonempty')
text = replace_once(text, '{combinedItems.map((item) => {', '{displayItems.map((item) => {', 'news rendering')
p.write_text(text, encoding='utf-8')

# User wants month names capitalized consistently across the Serbian UI.
calendar_path = Path('src/i18n/locales/sr-Latn/calendar.json')
calendar = json.loads(calendar_path.read_text(encoding='utf-8'))
for key, value in list(calendar.get('months', {}).items()):
    if isinstance(value, str) and value:
        calendar['months'][key] = value[0].upper() + value[1:]
calendar_path.write_text(json.dumps(calendar, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Refined News Board localization timing and capitalized Serbian month labels.')
