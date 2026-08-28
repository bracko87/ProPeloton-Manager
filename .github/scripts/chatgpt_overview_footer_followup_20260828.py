from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)

# --- My Profile: use bundled language emoji flags instead of missing /flags/*.svg ---
profile_path = Path('src/pages/MyProfile.tsx')
profile = profile_path.read_text(encoding='utf-8')
profile = replace_once(
    profile,
    '''              <img
                src={`/flags/${activeLanguageDefinition.countryCode.toLowerCase()}.svg`}
                alt=""
                className="h-[18px] w-6 shrink-0 rounded-[2px] border border-gray-200 object-cover"
                aria-hidden="true"
              />''',
    '''              <span className="text-xl leading-none" aria-hidden="true">
                {activeLanguageDefinition.flag}
              </span>''',
    'active language flag',
)
profile = replace_once(
    profile,
    '''                      <img
                        src={`/flags/${language.countryCode.toLowerCase()}.svg`}
                        alt=""
                        className="h-[18px] w-6 shrink-0 rounded-[2px] border border-gray-200 object-cover"
                        aria-hidden="true"
                      />''',
    '''                      <span className="text-xl leading-none" aria-hidden="true">
                        {language.flag}
                      </span>''',
    'language option flag',
)
profile_path.write_text(profile, encoding='utf-8')

# --- Footer: Serbian month names are normally lowercase, but this standalone game-date UI uses title casing ---
footer_path = Path('src/components/layout/Footer.tsx')
footer = footer_path.read_text(encoding='utf-8')
footer = replace_once(
    footer,
    '''    const localizedMonth = t(
      `calendar:months.${gameTime.month_name}`,
      { defaultValue: gameTime.month_name },
    )

    const localizedDate = t('calendar:date', {
      month: localizedMonth,''',
    '''    const localizedMonthRaw = t(
      `calendar:months.${gameTime.month_name}`,
      { defaultValue: gameTime.month_name },
    )
    const localizedMonth = localizedMonthRaw
      ? `${localizedMonthRaw.charAt(0).toLocaleUpperCase()}${localizedMonthRaw.slice(1)}`
      : localizedMonthRaw

    const localizedDate = t('calendar:date', {
      month: localizedMonth,''',
    'footer month capitalization',
)
footer_path.write_text(footer, encoding='utf-8')

# --- Overview: advisor modal + team/game news localization ---
overview_path = Path('src/pages/dashboard/Overview.tsx')
overview = overview_path.read_text(encoding='utf-8')

# Advisor information popover
replacements = [
    ('aria-label="What Staff Advisory provides"', 'aria-label={t("staffBriefing.whatProvidesAria")}', 'advisor info button aria'),
    ('title="Refreshing"', 'title={t("staffBriefing.refreshing")}', 'advisor refreshing title'),
    ('aria-label="Staff Advisory information"', 'aria-label={t("staffBriefing.infoAria")}', 'advisor dialog aria'),
    ('>\n                    Close\n                  </button>', '>\n                    {t("staffBriefing.close")}\n                  </button>', 'advisor info close'),
    ('Weekly training and readiness review: workload trends, repeated fatigue, morale/readiness patterns, development trends, and riders who may need closer management.', '{t("staffBriefing.roleInfo.headCoach")}', 'advisor head coach info'),
    ('Weekly race-program review: calendar congestion, rider-selection load, preparation risks, overlapping commitments, and areas of the race programme worth reviewing.', '{t("staffBriefing.roleInfo.sportsDirector")}', 'advisor sports director info'),
    ('Health and recovery analysis, at most once per real-life day: squad availability, repeated injury/sickness patterns, recovery trends, and health situations worth monitoring.', '{t("staffBriefing.roleInfo.teamDoctor")}', 'advisor team doctor info'),
    ('Weekly equipment review: condition and maintenance trends, recurring equipment issues, workload on the workshop, and race-supply usage worth reviewing.', '{t("staffBriefing.roleInfo.chiefMechanic")}', 'advisor mechanic info'),
    ('Weekly recruitment review using already-known scouting information: completed report summary, recruitment gaps, known prospects worth revisiting, and suggestions for where to scout next.', '{t("staffBriefing.roleInfo.scout")}', 'advisor scout info'),
]
for old, new, label in replacements:
    overview = replace_once(overview, old, new, label)

# Advisor assignment modal
modal_replacements = [
    ('>\n                Close\n              </button>', '>\n                {t("staffBriefing.close")}\n              </button>', 'assign modal close'),
    ('<div className="mt-4 text-sm text-slate-500">Loading eligible staff…</div>', '<div className="mt-4 text-sm text-slate-500">{t("staffBriefing.loadingEligible")}</div>', 'loading eligible staff'),
    ('>\n                  Staff member\n                </label>', '>\n                  {t("staffBriefing.staffMember")}\n                </label>', 'staff member label'),
    ('No eligible staff members are available for this role.', '{t("staffBriefing.noEligible")}', 'no eligible staff'),
    ('<div className="mt-4 text-sm text-slate-500">Loading quote…</div>', '<div className="mt-4 text-sm text-slate-500">{t("staffBriefing.loadingQuote")}</div>', 'loading quote'),
    ('["Price", `${quote.coin_price} coins`],', '[t("staffBriefing.price"), t("staffBriefing.coins", { count: quote.coin_price })],', 'quote price'),
    ('["Duration", t("staffBriefing.gameMonths", { count: quote.duration_game_months })],', '[t("staffBriefing.duration"), t("staffBriefing.gameMonths", { count: quote.duration_game_months })],', 'quote duration'),
    ('["New expiry", formatAdvisoryGameDate(quote.proposed_expires_at)],', '[t("staffBriefing.newExpiry"), formatAdvisoryGameDate(quote.proposed_expires_at)],', 'quote expiry'),
    ('["Automatic renewal", "No"],', '[t("staffBriefing.automaticRenewal"), t("staffBriefing.no")],', 'quote renewal'),
    ('["Coin balance", coinBalanceLoading ? "…" : String(coinBalance ?? 0)],', '[t("staffBriefing.coinBalance"), coinBalanceLoading ? "…" : String(coinBalance ?? 0)],', 'quote balance'),
    ('>\n                Cancel\n              </button>', '>\n                {t("staffBriefing.cancel")}\n              </button>', 'assign modal cancel'),
    ('? "Activating…"', '? t("staffBriefing.activating")', 'activating label'),
    ('? `Renew for ${quote.coin_price} coins`', '? t("staffBriefing.renewForCoins", { count: quote.coin_price })', 'renew for coins'),
    ('? `Assign for ${quote.coin_price} coins`', '? t("staffBriefing.assignForCoins", { count: quote.coin_price })', 'assign for coins'),
    (': "Confirm"}', ': t("staffBriefing.assign")}', 'confirm fallback'),
]
for old, new, label in modal_replacements:
    overview = replace_once(overview, old, new, label)

# Advisor errors shown to users
error_replacements = [
    ('err instanceof Error ? err.message : "Could not load eligible staff."', 'err instanceof Error ? err.message : t("staffBriefing.couldNotLoadStaff")', 'eligible staff fallback error'),
    ('err instanceof Error ? err.message : "Could not load advisory quote."', 'err instanceof Error ? err.message : t("staffBriefing.couldNotLoadQuote")', 'quote fallback error'),
    ('`Not enough coins. ${quote.coin_price} coins are required and your current balance is ${coinBalance ?? 0}.`', 't("staffBriefing.notEnoughCoins", { required: quote.coin_price, balance: coinBalance ?? 0 })', 'not enough coins'),
    ('error.message || "Staff Advisory activation failed."', 'error.message || t("staffBriefing.activationFailed")', 'activation error'),
    ('err instanceof Error ? err.message : "Could not activate Staff Advisory."', 'err instanceof Error ? err.message : t("staffBriefing.couldNotActivate")', 'activation fallback'),
]
for old, new, label in error_replacements:
    overview = replace_once(overview, old, new, label)

# Add a presentation-only team-news translator. World/cycling news remains untouched.
helper_anchor = '''/**
 * buildTeamNewsItems
 * Team news = attention items + existing activity feed.
 */
function buildTeamNewsItems('''
helper = '''function localizeOverviewTeamFeedCopy(
  title: string,
  subtitle: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): { title: string; subtitle: string } {
  const cleanTitle = (title ?? "").trim();
  const cleanSubtitle = (subtitle ?? "").trim();

  const sponsorOffersMatch = /^Sponsor offers ready for season\\s+(\\d+)$/i.exec(cleanTitle);
  if (sponsorOffersMatch) {
    return {
      title: t("news.sponsorOffersReady", { season: sponsorOffersMatch[1] }),
      subtitle: t("news.sponsorOffersReadyBody"),
    };
  }

  const staffHiredMatch = /^Staff hired:\\s*(.+)$/i.exec(cleanTitle);
  if (staffHiredMatch) {
    const name = staffHiredMatch[1].trim();
    const roleMatch = /has joined your club as\\s+(.+?)(?:\\.|$)/i.exec(cleanSubtitle);
    const rawRole = roleMatch?.[1]?.trim() ?? "";
    const role = /^scout analyst$/i.test(rawRole)
      ? t("news.staffRoleScoutAnalyst")
      : rawRole;

    return {
      title: t("news.staffHired", { name }),
      subtitle: role
        ? t("news.staffHiredBody", { name, role })
        : t("news.staffHiredBodyGeneric", { name }),
    };
  }

  return { title: cleanTitle, subtitle: cleanSubtitle };
}

/**
 * buildTeamNewsItems
 * Team news = attention items + existing activity feed.
 */
function buildTeamNewsItems('''
overview = replace_once(overview, helper_anchor, helper, 'insert team news localization helper')

overview = replace_once(
    overview,
    '''function buildTeamNewsItems(
  alerts: AlertItem[],
  feed: FeedItem[],
  currentGameDateLabel: string,
): OverviewNewsListItem[] {''',
    '''function buildTeamNewsItems(
  alerts: AlertItem[],
  feed: FeedItem[],
  currentGameDateLabel: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): OverviewNewsListItem[] {''',
    'team news signature',
)
overview = replace_once(
    overview,
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
    '''      subtitle: t("news.actionMayBeRequired"),
      timeLabel: getOverviewCurrentGameDateTimeLabel(currentGameDateLabel),
      href,
      level: alert.level,
      sourceLabel: "Team",
      expandedText: t("news.actionMayBeRequired"),
      linkLabel: t("news.openRelatedPage"),''',
    'alert news presentation',
)
overview = replace_once(
    overview,
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
    'feed news presentation',
)
overview = replace_once(
    overview,
    'const teamNewsItems = buildTeamNewsItems(alerts, feed, currentGameDateLabel);',
    'const teamNewsItems = buildTeamNewsItems(alerts, feed, currentGameDateLabel, t);',
    'team news call',
)
overview = replace_once(
    overview,
    '''                            {item.sourceLabel === "World"
                              ? t("news.world")
                              : t("news.team")} news''',
    '''                            {item.sourceLabel === "World"
                              ? t("news.worldNews")
                              : t("news.teamNews")}''',
    'expanded news badge',
)
overview = replace_once(
    overview,
    '''          <EmptyState
            title="No news yet"
            subtitle="Team updates, race results, ranking headlines, and world peloton news will appear here."
          />''',
    '''          <EmptyState
            title={t("news.noNews")}
            subtitle={t("news.noNewsSubtitle")}
          />''',
    'news empty state',
)

overview_path.write_text(overview, encoding='utf-8')

# --- Add matching EN/SR keys without disturbing existing structure ---
for locale, additions in {
    'en': {
        'actionMayBeRequired': 'Action may be required from your team management dashboard.',
        'openRelatedPage': 'Open related page',
        'sponsorOffersReady': 'Sponsor offers ready for season {{season}}',
        'sponsorOffersReadyBody': 'New sponsor offers are available for your team. Choose your sponsors for the current season.',
        'staffHired': 'Staff hired: {{name}}',
        'staffHiredBody': '{{name}} has joined your club as {{role}}.',
        'staffHiredBodyGeneric': '{{name}} has joined your club. Open the related page to review the update.',
        'staffRoleScoutAnalyst': 'Scout Analyst',
    },
    'sr-Latn': {
        'actionMayBeRequired': 'Možda je potrebna akcija na kontrolnoj tabli vašeg tima.',
        'openRelatedPage': 'Otvori povezanu stranicu',
        'sponsorOffersReady': 'Ponude sponzora spremne za sezonu {{season}}',
        'sponsorOffersReadyBody': 'Nove ponude sponzora su dostupne vašem timu. Izaberite sponzore za trenutnu sezonu.',
        'staffHired': 'Angažovan član osoblja: {{name}}',
        'staffHiredBody': '{{name}} se pridružio vašem klubu kao {{role}}.',
        'staffHiredBodyGeneric': '{{name}} se pridružio vašem klubu. Otvorite povezanu stranicu da pregledate ažuriranje.',
        'staffRoleScoutAnalyst': 'Skaut analitičar',
    },
}.items():
    p = Path(f'src/i18n/locales/{locale}/overview.json')
    data = json.loads(p.read_text(encoding='utf-8'))
    news = data.setdefault('news', {})
    news.update(additions)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Applied Overview, footer and profile localization follow-up.')
