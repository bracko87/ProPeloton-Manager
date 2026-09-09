from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ['en','sr-Latn','de','hr','es','it','fr','ru']


def set_path(obj: dict, path: str, value: str) -> None:
    parts = path.split('.')
    cur = obj
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


T = {
'en': {
'categories.stagePlanReminders':'Stage plan reminders','categories.raceApplicationResults':'Race application results','templateLocalization.genericMessage':'A new {{topic}} notification is available for your club.',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Race application daily update','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Race preparation daily report','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Stage planning daily report','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Rider health daily report','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Race applications open','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Race applications closing soon','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Race application deadline update','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Team removed from race','semanticTypeTitles.RACE_PLAN_FINALISED':'Race plan finalised','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Stage plan missing reminder',
'richReports.common.none':'None','richReports.common.more':'+ {{count}} more','richReports.common.stageNumber':'Stage {{number}}','richReports.common.stage':'Stage','richReports.common.lockDate':'lock {{date}}','richReports.common.riderDeadlineDate':'rider deadline {{date}}','richReports.common.closesToday':'closes today','richReports.common.fatigueValue':'fatigue {{value}}','richReports.common.statusInjured':'Injured','richReports.common.statusSick':'Sick','richReports.common.statusNotFullyFit':'Not fully fit','richReports.common.statusRecovered':'Recovered','richReports.common.raceFallback':'Race','richReports.common.riderFallback':'Rider','richReports.common.teamFallback':'Your team','richReports.common.thisRace':'this race',
'richReports.daily.application.intro':"Today's race-application overview — open windows: {{open}}; closing within 3 days: {{closing}}{{closingNames}}; awaiting a decision: {{pending}}.",'richReports.daily.application.open':'Application windows open','richReports.daily.application.closing':'Closing within 3 days','richReports.daily.application.next':'Next application deadlines','richReports.daily.application.pending':'Awaiting a decision','richReports.daily.application.extra':'Click a race name above to open its race detail page, or open the Calendar to compare all available applications.',
'richReports.daily.preparation.intro':"Today's race-preparation review — needs attention: {{attention}}; open or in progress: {{open}}; finalised: {{finalised}}.{{priority}}",'richReports.daily.preparation.priority':' Immediate attention: {{items}}.','richReports.daily.preparation.attention':'Needs attention','richReports.daily.preparation.open':'Open / in progress','richReports.daily.preparation.finalised':'Finalised','richReports.daily.preparation.extra':'Open Race Preparation to resolve anything requiring attention before the rider-submission deadline.',
'richReports.daily.stage.intro':"Today's stage-planning review — missing at lock: {{missing}}; locking soon: {{soon}}; open: {{open}}; recently locked: {{locked}}.{{priority}}",'richReports.daily.stage.priority':' Priority: {{items}}.','richReports.daily.stage.missing':'Missing at lock','richReports.daily.stage.soon':'Locking soon','richReports.daily.stage.open':'Open stage plans','richReports.daily.stage.locked':'Locked recently','richReports.daily.stage.extra':'Open Stage Plans and complete the nearest deadlines first. A plan that is missing when the stage locks can directly affect race execution.',
'richReports.daily.health.noIssues':'No new injuries, illnesses, fitness concerns, or recoveries were recorded today. No rider currently requires medical or fitness attention.','richReports.daily.health.intro':"Today's medical review — injured: {{injured}}; sick: {{sick}}; not fully fit: {{notFullyFit}}; recovered: {{recovered}}; currently needing attention: {{issues}}.",'richReports.daily.health.injuries':'New injuries','richReports.daily.health.sick':'Sick today','richReports.daily.health.notFullyFit':'Not fully fit today','richReports.daily.health.recovered':'Recovered today','richReports.daily.health.current':'Current medical / fitness attention','richReports.daily.health.extra':'Open the Squad to review rider availability, recovery status, and any medical or fitness restrictions.',
'richReports.race.windowOpenOne':'{{raceName}} is now accepting applications. Check the race page for entry rules, route overview, application deadline, and squad readiness before submitting your team.','richReports.race.windowOpenMany':'{{count}} race application windows are now open{{races}}. Review the Calendar for entry rules, deadlines, and squad readiness before applying.','richReports.race.closingSoonOne':'One race application window closes in 3 days{{races}}. Review the race page, confirm squad availability and equipment readiness, and submit before the deadline.','richReports.race.closingSoonMany':'{{count}} race application windows close in 3 days{{races}}. Review each race page, confirm squad availability and equipment readiness, and submit before the deadlines.','richReports.race.ruleChange':'Application timing rules have been updated. Late-January races use a {{lateDays}}-day closing window, while February and later races use a {{standardDays}}-day application deadline. Review your planning now so you do not miss future entries.','richReports.race.teamRemoved':'{{team}} was automatically removed from {{race}} because the mandatory Race Jersey Kit requirement was not met{{stagePart}}.{{stockPart}} The removal applies to the affected stage and every remaining stage, so the team and its riders can no longer place or score points in this race.','richReports.race.stagePart':' before Stage {{stage}}','richReports.race.stockPart':' Required: {{required}}; available: {{available}}.','richReports.race.prestart':'{{team}} was removed from {{race}} at the mandatory pre-start eligibility check because it did not have enough eligible Race Jersey Kits.{{stockPart}} This is a club-controllable race-preparation failure, so the normal missed-start/no-show consequences were applied.','richReports.race.prestartStock':' The eligibility check recorded {{required}} required, {{available}} eligible{{missingPart}}.','richReports.race.prestartMissing':', and {{missing}} missing','richReports.race.extraRemoved':'Open Equipment to review inventory and prevent the same issue in future races.','richReports.race.extraOpenOne':'Open the race page now to review requirements and apply early.','richReports.race.extraOpenMany':'Open the Calendar now to review all newly opened races and apply early.','richReports.race.extraClosing':'Open the Calendar now to compare races and apply before the application windows close.','richReports.race.extraRule':'Open the Calendar to review February races and adapt your application plan early.','richReports.race.extraPrestart':'The penalty has already been applied. Open the race for context, or go directly to Race Supplies to review eligible race jerseys and avoid the same issue at a future start.','richReports.race.removedRemaining':'Removed for the remaining race','richReports.race.closesInDays':'Closes in {{days}} days','richReports.race.lateJanuaryRule':'Applications close {{days}} days before the start','richReports.race.februaryRule':'Applications close {{days}} days before the start','richReports.race.entryFeeRetained':'Retained (not refunded)','richReports.race.outcomeRemoved':'Removed before/at race start','richReports.race.problemJerseys':'Not enough eligible Race Jersey Kits',
},
'sr-Latn': {
'categories.stagePlanReminders':'Podsetnici za planove etapa','categories.raceApplicationResults':'Rezultati prijava za trke','templateLocalization.genericMessage':'Novo obaveštenje „{{topic}}“ dostupno je za vaš klub.',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Dnevni pregled prijava za trke','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Dnevni izveštaj o pripremi trka','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Dnevni izveštaj o planiranju etapa','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Dnevni izveštaj o zdravlju vozača','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Prijave za trke su otvorene','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Prijave za trke se uskoro zatvaraju','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Izmena rokova za prijavu na trke','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Tim je uklonjen sa trke','semanticTypeTitles.RACE_PLAN_FINALISED':'Plan trke je završen','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Podsetnik: nedostaje plan etape',
'richReports.common.none':'Nema','richReports.common.more':'+ još {{count}}','richReports.common.stageNumber':'Etapa {{number}}','richReports.common.stage':'Etapa','richReports.common.lockDate':'zaključavanje {{date}}','richReports.common.riderDeadlineDate':'rok za vozače {{date}}','richReports.common.closesToday':'zatvara se danas','richReports.common.fatigueValue':'umor {{value}}','richReports.common.statusInjured':'Povređen','richReports.common.statusSick':'Bolestan','richReports.common.statusNotFullyFit':'Nije potpuno spreman','richReports.common.statusRecovered':'Oporavljen','richReports.common.raceFallback':'Trka','richReports.common.riderFallback':'Vozač','richReports.common.teamFallback':'Vaš tim','richReports.common.thisRace':'ova trka',
'richReports.daily.application.intro':'Današnji pregled prijava za trke — otvoreni rokovi: {{open}}; zatvaraju se u naredna 3 dana: {{closing}}{{closingNames}}; čekaju odluku: {{pending}}.','richReports.daily.application.open':'Otvoreni rokovi za prijavu','richReports.daily.application.closing':'Zatvaraju se u naredna 3 dana','richReports.daily.application.next':'Sledeći rokovi za prijavu','richReports.daily.application.pending':'Čekaju odluku','richReports.daily.application.extra':'Kliknite na naziv trke iznad da otvorite detalje trke ili otvorite Kalendar da uporedite sve dostupne prijave.',
'richReports.daily.preparation.intro':'Današnji pregled pripreme trka — zahteva pažnju: {{attention}}; otvoreno ili u toku: {{open}}; završeno: {{finalised}}.{{priority}}','richReports.daily.preparation.priority':' Hitno pregledati: {{items}}.','richReports.daily.preparation.attention':'Zahteva pažnju','richReports.daily.preparation.open':'Otvoreno / u toku','richReports.daily.preparation.finalised':'Završeno','richReports.daily.preparation.extra':'Otvorite Pripremu trke i rešite sve stavke koje zahtevaju pažnju pre roka za prijavu vozača.',
'richReports.daily.stage.intro':'Današnji pregled planiranja etapa — nedostaje pri zaključavanju: {{missing}}; uskoro se zaključava: {{soon}}; otvoreno: {{open}}; nedavno zaključano: {{locked}}.{{priority}}','richReports.daily.stage.priority':' Prioritet: {{items}}.','richReports.daily.stage.missing':'Nedostaje pri zaključavanju','richReports.daily.stage.soon':'Uskoro se zaključava','richReports.daily.stage.open':'Otvoreni planovi etapa','richReports.daily.stage.locked':'Nedavno zaključano','richReports.daily.stage.extra':'Otvorite Planove etapa i prvo završite etape sa najbližim rokovima. Plan koji nedostaje u trenutku zaključavanja može direktno uticati na izvršenje trke.',
'richReports.daily.health.noIssues':'Danas nisu zabeležene nove povrede, bolesti, problemi sa spremnošću ni oporavci. Nijedan vozač trenutno ne zahteva medicinsku ili kondicionu pažnju.','richReports.daily.health.intro':'Današnji medicinski pregled — povređeni: {{injured}}; bolesni: {{sick}}; nisu potpuno spremni: {{notFullyFit}}; oporavljeni: {{recovered}}; trenutno zahtevaju pažnju: {{issues}}.','richReports.daily.health.injuries':'Nove povrede','richReports.daily.health.sick':'Bolesni danas','richReports.daily.health.notFullyFit':'Danas nisu potpuno spremni','richReports.daily.health.recovered':'Oporavljeni danas','richReports.daily.health.current':'Trenutna medicinska / kondiciona pažnja','richReports.daily.health.extra':'Otvorite Tim da pregledate dostupnost vozača, status oporavka i sva medicinska ili kondiciona ograničenja.',
'richReports.race.windowOpenOne':'{{raceName}} sada prima prijave. Proverite stranicu trke za pravila prijave, pregled trase, rok i spremnost ekipe pre slanja prijave.','richReports.race.windowOpenMany':'Otvoreno je {{count}} rokova za prijavu na trke{{races}}. Pregledajte Kalendar, pravila prijave, rokove i spremnost ekipe pre prijave.','richReports.race.closingSoonOne':'Jedan rok za prijavu na trku ističe za 3 dana{{races}}. Proverite stranicu trke, dostupnost ekipe i spremnost opreme i pošaljite prijavu pre roka.','richReports.race.closingSoonMany':'{{count}} rokova za prijavu na trke ističe za 3 dana{{races}}. Proverite trke, dostupnost ekipe i spremnost opreme i pošaljite prijave pre rokova.','richReports.race.ruleChange':'Pravila rokova za prijavu su izmenjena. Trke krajem januara koriste rok od {{lateDays}} dana, dok se od februara prijave zatvaraju {{standardDays}} dana pre trke. Pregledajte planiranje da ne propustite buduće prijave.','richReports.race.teamRemoved':'{{team}} je automatski uklonjen sa trke {{race}} jer nije ispunjen obavezni uslov za komplet trkačkog dresa{{stagePart}}.{{stockPart}} Uklanjanje važi za tu etapu i sve preostale etape, pa tim i njegovi vozači više ne mogu ostvariti plasman ni bodove u ovoj trci.','richReports.race.stagePart':' pre etape {{stage}}','richReports.race.stockPart':' Potrebno: {{required}}; dostupno: {{available}}.','richReports.race.prestart':'{{team}} je uklonjen sa trke {{race}} pri obaveznoj proveri uslova pre starta jer nije imao dovoljno dostupnih kompleta trkačkih dresova.{{stockPart}} Ovo je propust u pripremi trke koji klub može da kontroliše, pa su primenjene uobičajene posledice za propušten start.','richReports.race.prestartStock':' Provera je pokazala: potrebno {{required}}, dostupno {{available}}{{missingPart}}.','richReports.race.prestartMissing':', nedostaje {{missing}}','richReports.race.extraRemoved':'Otvorite Opremu da pregledate zalihe i sprečite isti problem na budućim trkama.','richReports.race.extraOpenOne':'Otvorite stranicu trke, pregledajte uslove i prijavite se na vreme.','richReports.race.extraOpenMany':'Otvorite Kalendar, pregledajte sve novo otvorene trke i prijavite se na vreme.','richReports.race.extraClosing':'Otvorite Kalendar, uporedite trke i prijavite se pre zatvaranja rokova.','richReports.race.extraRule':'Otvorite Kalendar, pregledajte trke od februara i na vreme prilagodite plan prijava.','richReports.race.extraPrestart':'Kazna je već primenjena. Otvorite trku za kontekst ili direktno otvorite Zalihe za trku da proverite dostupne dresove i izbegnete isti problem pri budućem startu.','richReports.race.removedRemaining':'Uklonjen do kraja trke','richReports.race.closesInDays':'Zatvara se za {{days}} dana','richReports.race.lateJanuaryRule':'Prijave se zatvaraju {{days}} dana pre starta','richReports.race.februaryRule':'Prijave se zatvaraju {{days}} dana pre starta','richReports.race.entryFeeRetained':'Zadržana (nije vraćena)','richReports.race.outcomeRemoved':'Uklonjen pre/na startu trke','richReports.race.problemJerseys':'Nema dovoljno dostupnih kompleta trkačkih dresova',
},
'hr': {
'categories.stagePlanReminders':'Podsjetnici za planove etapa','categories.raceApplicationResults':'Rezultati prijava za utrke','templateLocalization.genericMessage':'Nova obavijest „{{topic}}“ dostupna je za vaš klub.',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Dnevni pregled prijava za utrke','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Dnevno izvješće o pripremi utrka','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Dnevno izvješće o planiranju etapa','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Dnevno izvješće o zdravlju vozača','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Prijave za utrke su otvorene','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Prijave za utrke uskoro se zatvaraju','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Promjena rokova za prijavu na utrke','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Momčad je uklonjena iz utrke','semanticTypeTitles.RACE_PLAN_FINALISED':'Plan utrke je dovršen','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Podsjetnik: nedostaje plan etape',
'richReports.common.none':'Nema','richReports.common.more':'+ još {{count}}','richReports.common.stageNumber':'Etapa {{number}}','richReports.common.stage':'Etapa','richReports.common.lockDate':'zaključavanje {{date}}','richReports.common.riderDeadlineDate':'rok za vozače {{date}}','richReports.common.closesToday':'zatvara se danas','richReports.common.fatigueValue':'umor {{value}}','richReports.common.statusInjured':'Ozlijeđen','richReports.common.statusSick':'Bolestan','richReports.common.statusNotFullyFit':'Nije potpuno spreman','richReports.common.statusRecovered':'Oporavljen','richReports.common.raceFallback':'Utrka','richReports.common.riderFallback':'Vozač','richReports.common.teamFallback':'Vaša momčad','richReports.common.thisRace':'ova utrka',
'richReports.daily.application.intro':'Današnji pregled prijava za utrke — otvoreni rokovi: {{open}}; zatvaraju se u sljedeća 3 dana: {{closing}}{{closingNames}}; čekaju odluku: {{pending}}.','richReports.daily.application.open':'Otvoreni rokovi za prijavu','richReports.daily.application.closing':'Zatvaraju se u sljedeća 3 dana','richReports.daily.application.next':'Sljedeći rokovi za prijavu','richReports.daily.application.pending':'Čekaju odluku','richReports.daily.application.extra':'Kliknite naziv utrke iznad kako biste otvorili detalje utrke ili otvorite Kalendar za usporedbu svih dostupnih prijava.',
'richReports.daily.preparation.intro':'Današnji pregled pripreme utrka — zahtijeva pažnju: {{attention}}; otvoreno ili u tijeku: {{open}}; dovršeno: {{finalised}}.{{priority}}','richReports.daily.preparation.priority':' Hitno pregledati: {{items}}.','richReports.daily.preparation.attention':'Zahtijeva pažnju','richReports.daily.preparation.open':'Otvoreno / u tijeku','richReports.daily.preparation.finalised':'Dovršeno','richReports.daily.preparation.extra':'Otvorite Pripremu utrke i riješite sve stavke koje zahtijevaju pažnju prije roka za prijavu vozača.',
'richReports.daily.stage.intro':'Današnji pregled planiranja etapa — nedostaje pri zaključavanju: {{missing}}; uskoro se zaključava: {{soon}}; otvoreno: {{open}}; nedavno zaključano: {{locked}}.{{priority}}','richReports.daily.stage.priority':' Prioritet: {{items}}.','richReports.daily.stage.missing':'Nedostaje pri zaključavanju','richReports.daily.stage.soon':'Uskoro se zaključava','richReports.daily.stage.open':'Otvoreni planovi etapa','richReports.daily.stage.locked':'Nedavno zaključano','richReports.daily.stage.extra':'Otvorite Planove etapa i prvo dovršite etape s najbližim rokovima. Plan koji nedostaje u trenutku zaključavanja može izravno utjecati na izvođenje utrke.',
'richReports.daily.health.noIssues':'Danas nisu zabilježene nove ozljede, bolesti, problemi sa spremnošću ni oporavci. Nijedan vozač trenutačno ne zahtijeva medicinsku ili kondicijsku pažnju.','richReports.daily.health.intro':'Današnji medicinski pregled — ozlijeđeni: {{injured}}; bolesni: {{sick}}; nisu potpuno spremni: {{notFullyFit}}; oporavljeni: {{recovered}}; trenutačno zahtijevaju pažnju: {{issues}}.','richReports.daily.health.injuries':'Nove ozljede','richReports.daily.health.sick':'Bolesni danas','richReports.daily.health.notFullyFit':'Danas nisu potpuno spremni','richReports.daily.health.recovered':'Oporavljeni danas','richReports.daily.health.current':'Trenutačna medicinska / kondicijska pažnja','richReports.daily.health.extra':'Otvorite Momčad kako biste pregledali dostupnost vozača, status oporavka i sva medicinska ili kondicijska ograničenja.',
'richReports.race.windowOpenOne':'{{raceName}} sada prima prijave. Provjerite stranicu utrke za pravila prijave, pregled trase, rok i spremnost momčadi prije slanja prijave.','richReports.race.windowOpenMany':'Otvoreno je {{count}} rokova za prijavu na utrke{{races}}. Pregledajte Kalendar, pravila prijave, rokove i spremnost momčadi prije prijave.','richReports.race.closingSoonOne':'Jedan rok za prijavu na utrku istječe za 3 dana{{races}}. Provjerite utrku, dostupnost momčadi i spremnost opreme te pošaljite prijavu prije roka.','richReports.race.closingSoonMany':'{{count}} rokova za prijavu na utrke istječe za 3 dana{{races}}. Provjerite utrke, dostupnost momčadi i spremnost opreme te pošaljite prijave prije rokova.','richReports.race.ruleChange':'Pravila rokova za prijavu su promijenjena. Utrke krajem siječnja koriste rok od {{lateDays}} dana, dok se od veljače prijave zatvaraju {{standardDays}} dana prije utrke. Pregledajte planiranje kako ne biste propustili buduće prijave.','richReports.race.teamRemoved':'{{team}} je automatski uklonjena iz utrke {{race}} jer nije ispunjen obvezni uvjet za komplet trkaćeg dresa{{stagePart}}.{{stockPart}} Uklanjanje vrijedi za tu etapu i sve preostale etape pa momčad i njezini vozači više ne mogu ostvarivati plasman ni bodove u ovoj utrci.','richReports.race.stagePart':' prije etape {{stage}}','richReports.race.stockPart':' Potrebno: {{required}}; dostupno: {{available}}.','richReports.race.prestart':'{{team}} je uklonjena iz utrke {{race}} pri obveznoj provjeri uvjeta prije starta jer nije imala dovoljno dostupnih kompleta trkaćih dresova.{{stockPart}} Ovo je propust u pripremi utrke koji klub može kontrolirati pa su primijenjene uobičajene posljedice za propušten start.','richReports.race.prestartStock':' Provjera je pokazala: potrebno {{required}}, dostupno {{available}}{{missingPart}}.','richReports.race.prestartMissing':', nedostaje {{missing}}','richReports.race.extraRemoved':'Otvorite Opremu kako biste pregledali zalihe i spriječili isti problem na budućim utrkama.','richReports.race.extraOpenOne':'Otvorite stranicu utrke, pregledajte uvjete i prijavite se na vrijeme.','richReports.race.extraOpenMany':'Otvorite Kalendar, pregledajte sve novootvorene utrke i prijavite se na vrijeme.','richReports.race.extraClosing':'Otvorite Kalendar, usporedite utrke i prijavite se prije zatvaranja rokova.','richReports.race.extraRule':'Otvorite Kalendar, pregledajte utrke od veljače i na vrijeme prilagodite plan prijava.','richReports.race.extraPrestart':'Kazna je već primijenjena. Otvorite utrku radi konteksta ili izravno otvorite Zalihe za utrku kako biste provjerili dostupne dresove i izbjegli isti problem pri budućem startu.','richReports.race.removedRemaining':'Uklonjena do kraja utrke','richReports.race.closesInDays':'Zatvara se za {{days}} dana','richReports.race.lateJanuaryRule':'Prijave se zatvaraju {{days}} dana prije starta','richReports.race.februaryRule':'Prijave se zatvaraju {{days}} dana prije starta','richReports.race.entryFeeRetained':'Zadržana (nije vraćena)','richReports.race.outcomeRemoved':'Uklonjena prije/na startu utrke','richReports.race.problemJerseys':'Nema dovoljno dostupnih kompleta trkaćih dresova',
},
'de': {
'categories.stagePlanReminders':'Erinnerungen an Etappenpläne','categories.raceApplicationResults':'Ergebnisse der Rennanmeldungen','templateLocalization.genericMessage':'Eine neue Benachrichtigung zu „{{topic}}“ ist für Ihren Club verfügbar.',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Tägliche Übersicht der Rennanmeldungen','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Täglicher Bericht zur Rennvorbereitung','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Täglicher Bericht zur Etappenplanung','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Täglicher Bericht zur Fahrergesundheit','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Rennanmeldungen geöffnet','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Rennanmeldungen schließen bald','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Änderung der Anmeldefristen','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Team aus dem Rennen entfernt','semanticTypeTitles.RACE_PLAN_FINALISED':'Rennplan abgeschlossen','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Erinnerung: Etappenplan fehlt',
'richReports.common.none':'Keine','richReports.common.more':'+ {{count}} weitere','richReports.common.stageNumber':'Etappe {{number}}','richReports.common.stage':'Etappe','richReports.common.lockDate':'Sperre {{date}}','richReports.common.riderDeadlineDate':'Fahrerfrist {{date}}','richReports.common.closesToday':'schließt heute','richReports.common.fatigueValue':'Müdigkeit {{value}}','richReports.common.statusInjured':'Verletzt','richReports.common.statusSick':'Krank','richReports.common.statusNotFullyFit':'Nicht vollständig fit','richReports.common.statusRecovered':'Erholt','richReports.common.raceFallback':'Rennen','richReports.common.riderFallback':'Fahrer','richReports.common.teamFallback':'Ihr Team','richReports.common.thisRace':'diesem Rennen',
'richReports.daily.application.intro':'Heutige Übersicht der Rennanmeldungen — offene Anmeldefenster: {{open}}; schließen innerhalb von 3 Tagen: {{closing}}{{closingNames}}; warten auf Entscheidung: {{pending}}.','richReports.daily.application.open':'Offene Anmeldefenster','richReports.daily.application.closing':'Schließen innerhalb von 3 Tagen','richReports.daily.application.next':'Nächste Anmeldefristen','richReports.daily.application.pending':'Warten auf Entscheidung','richReports.daily.application.extra':'Klicken Sie oben auf einen Rennnamen, um die Renndetails zu öffnen, oder öffnen Sie den Kalender, um alle verfügbaren Anmeldungen zu vergleichen.',
'richReports.daily.preparation.intro':'Heutiger Überblick zur Rennvorbereitung — Handlungsbedarf: {{attention}}; offen oder in Bearbeitung: {{open}}; abgeschlossen: {{finalised}}.{{priority}}','richReports.daily.preparation.priority':' Sofort prüfen: {{items}}.','richReports.daily.preparation.attention':'Handlungsbedarf','richReports.daily.preparation.open':'Offen / in Bearbeitung','richReports.daily.preparation.finalised':'Abgeschlossen','richReports.daily.preparation.extra':'Öffnen Sie die Rennvorbereitung und klären Sie alle Punkte mit Handlungsbedarf vor der Fahrer-Meldefrist.',
'richReports.daily.stage.intro':'Heutiger Überblick zur Etappenplanung — beim Sperren fehlend: {{missing}}; bald gesperrt: {{soon}}; offen: {{open}}; kürzlich gesperrt: {{locked}}.{{priority}}','richReports.daily.stage.priority':' Priorität: {{items}}.','richReports.daily.stage.missing':'Beim Sperren fehlend','richReports.daily.stage.soon':'Bald gesperrt','richReports.daily.stage.open':'Offene Etappenpläne','richReports.daily.stage.locked':'Kürzlich gesperrt','richReports.daily.stage.extra':'Öffnen Sie die Etappenpläne und bearbeiten Sie zuerst die nächsten Fristen. Ein beim Sperren fehlender Plan kann die Rennausführung direkt beeinflussen.',
'richReports.daily.health.noIssues':'Heute wurden keine neuen Verletzungen, Erkrankungen, Fitnessprobleme oder Genesungen registriert. Derzeit benötigt kein Fahrer medizinische oder Fitness-Aufmerksamkeit.','richReports.daily.health.intro':'Heutiger medizinischer Überblick — verletzt: {{injured}}; krank: {{sick}}; nicht vollständig fit: {{notFullyFit}}; erholt: {{recovered}}; aktuell mit Handlungsbedarf: {{issues}}.','richReports.daily.health.injuries':'Neue Verletzungen','richReports.daily.health.sick':'Heute krank','richReports.daily.health.notFullyFit':'Heute nicht vollständig fit','richReports.daily.health.recovered':'Heute erholt','richReports.daily.health.current':'Aktueller medizinischer / Fitness-Handlungsbedarf','richReports.daily.health.extra':'Öffnen Sie den Kader, um Verfügbarkeit, Genesungsstatus sowie medizinische oder Fitness-Einschränkungen der Fahrer zu prüfen.',
'richReports.race.windowOpenOne':'{{raceName}} nimmt jetzt Anmeldungen an. Prüfen Sie auf der Rennseite Teilnahmebedingungen, Strecke, Anmeldefrist und Kaderbereitschaft, bevor Sie Ihr Team anmelden.','richReports.race.windowOpenMany':'{{count}} Rennanmeldefenster sind jetzt geöffnet{{races}}. Prüfen Sie im Kalender Teilnahmebedingungen, Fristen und Kaderbereitschaft.','richReports.race.closingSoonOne':'Ein Rennanmeldefenster schließt in 3 Tagen{{races}}. Prüfen Sie das Rennen, Kaderverfügbarkeit und Ausrüstungsbereitschaft und melden Sie rechtzeitig an.','richReports.race.closingSoonMany':'{{count}} Rennanmeldefenster schließen in 3 Tagen{{races}}. Prüfen Sie die Rennen, Kaderverfügbarkeit und Ausrüstungsbereitschaft und melden Sie rechtzeitig an.','richReports.race.ruleChange':'Die Regeln für Anmeldefristen wurden aktualisiert. Rennen Ende Januar verwenden ein {{lateDays}}-Tage-Fenster; ab Februar schließen Anmeldungen {{standardDays}} Tage vor dem Rennen. Prüfen Sie Ihre Planung, damit Sie keine zukünftige Anmeldung verpassen.','richReports.race.teamRemoved':'{{team}} wurde automatisch aus {{race}} entfernt, weil die vorgeschriebene Renntrikot-Anforderung{{stagePart}} nicht erfüllt war.{{stockPart}} Die Entfernung gilt für die betroffene und alle verbleibenden Etappen; Team und Fahrer können in diesem Rennen keine Platzierungen oder Punkte mehr erzielen.','richReports.race.stagePart':' vor Etappe {{stage}}','richReports.race.stockPart':' Benötigt: {{required}}; verfügbar: {{available}}.','richReports.race.prestart':'{{team}} wurde bei der vorgeschriebenen Prüfung vor dem Start aus {{race}} entfernt, weil nicht genügend zulässige Renntrikot-Sets verfügbar waren.{{stockPart}} Dies ist ein vom Club beeinflussbarer Fehler der Rennvorbereitung; daher wurden die üblichen Folgen eines verpassten Starts angewendet.','richReports.race.prestartStock':' Die Prüfung ergab: {{required}} benötigt, {{available}} zulässig{{missingPart}}.','richReports.race.prestartMissing':', {{missing}} fehlend','richReports.race.extraRemoved':'Öffnen Sie die Ausrüstung, um den Bestand zu prüfen und dasselbe Problem bei künftigen Rennen zu vermeiden.','richReports.race.extraOpenOne':'Öffnen Sie jetzt die Rennseite, prüfen Sie die Anforderungen und melden Sie frühzeitig an.','richReports.race.extraOpenMany':'Öffnen Sie jetzt den Kalender, prüfen Sie alle neu geöffneten Rennen und melden Sie frühzeitig an.','richReports.race.extraClosing':'Öffnen Sie den Kalender, vergleichen Sie die Rennen und melden Sie an, bevor die Anmeldefenster schließen.','richReports.race.extraRule':'Öffnen Sie den Kalender, prüfen Sie die Rennen ab Februar und passen Sie Ihre Anmeldeplanung frühzeitig an.','richReports.race.extraPrestart':'Die Strafe wurde bereits angewendet. Öffnen Sie das Rennen für den Kontext oder direkt die Rennvorräte, um zulässige Renntrikots zu prüfen und dasselbe Problem künftig zu vermeiden.','richReports.race.removedRemaining':'Für den Rest des Rennens entfernt','richReports.race.closesInDays':'Schließt in {{days}} Tagen','richReports.race.lateJanuaryRule':'Anmeldungen schließen {{days}} Tage vor dem Start','richReports.race.februaryRule':'Anmeldungen schließen {{days}} Tage vor dem Start','richReports.race.entryFeeRetained':'Einbehalten (nicht erstattet)','richReports.race.outcomeRemoved':'Vor/bei Rennstart entfernt','richReports.race.problemJerseys':'Nicht genügend zulässige Renntrikot-Sets',
},
'es': {
'categories.stagePlanReminders':'Recordatorios de planes de etapa','categories.raceApplicationResults':'Resultados de las inscripciones a carreras','templateLocalization.genericMessage':'Hay una nueva notificación de «{{topic}}» disponible para tu club.',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Resumen diario de inscripciones a carreras','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Informe diario de preparación de carreras','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Informe diario de planificación de etapas','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Informe diario de salud de los corredores','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Inscripciones a carreras abiertas','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Las inscripciones a carreras cierran pronto','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Cambio de plazos de inscripción','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Equipo retirado de la carrera','semanticTypeTitles.RACE_PLAN_FINALISED':'Plan de carrera finalizado','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Recordatorio: falta el plan de etapa',
'richReports.common.none':'Ninguno','richReports.common.more':'+ {{count}} más','richReports.common.stageNumber':'Etapa {{number}}','richReports.common.stage':'Etapa','richReports.common.lockDate':'bloqueo {{date}}','richReports.common.riderDeadlineDate':'plazo de corredores {{date}}','richReports.common.closesToday':'cierra hoy','richReports.common.fatigueValue':'fatiga {{value}}','richReports.common.statusInjured':'Lesionado','richReports.common.statusSick':'Enfermo','richReports.common.statusNotFullyFit':'No está totalmente en forma','richReports.common.statusRecovered':'Recuperado','richReports.common.raceFallback':'Carrera','richReports.common.riderFallback':'Corredor','richReports.common.teamFallback':'Tu equipo','richReports.common.thisRace':'esta carrera',
'richReports.daily.application.intro':'Resumen de inscripciones de hoy — ventanas abiertas: {{open}}; cierran en los próximos 3 días: {{closing}}{{closingNames}}; pendientes de decisión: {{pending}}.','richReports.daily.application.open':'Ventanas de inscripción abiertas','richReports.daily.application.closing':'Cierran en los próximos 3 días','richReports.daily.application.next':'Próximos plazos de inscripción','richReports.daily.application.pending':'Pendientes de decisión','richReports.daily.application.extra':'Haz clic en el nombre de una carrera para abrir sus detalles o abre el Calendario para comparar todas las inscripciones disponibles.',
'richReports.daily.preparation.intro':'Resumen de preparación de carreras de hoy — requieren atención: {{attention}}; abiertas o en curso: {{open}}; finalizadas: {{finalised}}.{{priority}}','richReports.daily.preparation.priority':' Atención inmediata: {{items}}.','richReports.daily.preparation.attention':'Requieren atención','richReports.daily.preparation.open':'Abiertas / en curso','richReports.daily.preparation.finalised':'Finalizadas','richReports.daily.preparation.extra':'Abre Preparación de carrera y resuelve todo lo que requiera atención antes del plazo de inscripción de corredores.',
'richReports.daily.stage.intro':'Resumen de planificación de etapas de hoy — faltantes al bloquearse: {{missing}}; próximos a bloquearse: {{soon}}; abiertos: {{open}}; bloqueados recientemente: {{locked}}.{{priority}}','richReports.daily.stage.priority':' Prioridad: {{items}}.','richReports.daily.stage.missing':'Faltantes al bloquearse','richReports.daily.stage.soon':'Próximos a bloquearse','richReports.daily.stage.open':'Planes de etapa abiertos','richReports.daily.stage.locked':'Bloqueados recientemente','richReports.daily.stage.extra':'Abre Planes de etapa y completa primero los plazos más cercanos. Un plan que falte al bloquearse puede afectar directamente a la ejecución de la carrera.',
'richReports.daily.health.noIssues':'Hoy no se registraron nuevas lesiones, enfermedades, problemas de forma ni recuperaciones. Ningún corredor requiere actualmente atención médica o de forma física.','richReports.daily.health.intro':'Resumen médico de hoy — lesionados: {{injured}}; enfermos: {{sick}}; no totalmente en forma: {{notFullyFit}}; recuperados: {{recovered}}; requieren atención actualmente: {{issues}}.','richReports.daily.health.injuries':'Nuevas lesiones','richReports.daily.health.sick':'Enfermos hoy','richReports.daily.health.notFullyFit':'No totalmente en forma hoy','richReports.daily.health.recovered':'Recuperados hoy','richReports.daily.health.current':'Atención médica / de forma actual','richReports.daily.health.extra':'Abre la Plantilla para revisar la disponibilidad de los corredores, su recuperación y cualquier restricción médica o física.',
'richReports.race.windowOpenOne':'{{raceName}} ya acepta inscripciones. Revisa la página de la carrera, las reglas de entrada, el recorrido, el plazo y la preparación de la plantilla antes de enviar tu equipo.','richReports.race.windowOpenMany':'Hay {{count}} ventanas de inscripción abiertas{{races}}. Revisa el Calendario, las reglas, los plazos y la preparación de la plantilla antes de inscribirte.','richReports.race.closingSoonOne':'Una ventana de inscripción cierra en 3 días{{races}}. Revisa la carrera, la disponibilidad de la plantilla y el equipo y envía la inscripción antes del plazo.','richReports.race.closingSoonMany':'{{count}} ventanas de inscripción cierran en 3 días{{races}}. Revisa las carreras, la disponibilidad de la plantilla y el equipo y envía las inscripciones antes de los plazos.','richReports.race.ruleChange':'Se han actualizado los plazos de inscripción. Las carreras de finales de enero usan una ventana de {{lateDays}} días; desde febrero, las inscripciones cierran {{standardDays}} días antes de la carrera. Revisa tu planificación para no perder futuras inscripciones.','richReports.race.teamRemoved':'{{team}} fue retirado automáticamente de {{race}} porque no cumplía el requisito obligatorio de maillots de carrera{{stagePart}}.{{stockPart}} La retirada se aplica a la etapa afectada y a todas las restantes, por lo que el equipo y sus corredores ya no pueden clasificarse ni puntuar en esta carrera.','richReports.race.stagePart':' antes de la etapa {{stage}}','richReports.race.stockPart':' Necesarios: {{required}}; disponibles: {{available}}.','richReports.race.prestart':'{{team}} fue retirado de {{race}} en la comprobación obligatoria previa a la salida porque no tenía suficientes kits de maillot elegibles.{{stockPart}} Es un fallo de preparación controlable por el club, por lo que se aplicaron las consecuencias habituales de una salida perdida.','richReports.race.prestartStock':' La comprobación registró: {{required}} necesarios, {{available}} elegibles{{missingPart}}.','richReports.race.prestartMissing':', {{missing}} faltantes','richReports.race.extraRemoved':'Abre Equipamiento para revisar el inventario y evitar el mismo problema en futuras carreras.','richReports.race.extraOpenOne':'Abre la página de la carrera, revisa los requisitos e inscríbete con tiempo.','richReports.race.extraOpenMany':'Abre el Calendario, revisa todas las carreras recién abiertas e inscríbete con tiempo.','richReports.race.extraClosing':'Abre el Calendario, compara las carreras e inscríbete antes de que cierren las ventanas.','richReports.race.extraRule':'Abre el Calendario, revisa las carreras desde febrero y adapta tu plan de inscripciones con tiempo.','richReports.race.extraPrestart':'La sanción ya se aplicó. Abre la carrera para ver el contexto o ve directamente a Suministros de carrera para revisar los maillots elegibles y evitar el mismo problema en una salida futura.','richReports.race.removedRemaining':'Retirado para el resto de la carrera','richReports.race.closesInDays':'Cierra en {{days}} días','richReports.race.lateJanuaryRule':'Las inscripciones cierran {{days}} días antes de la salida','richReports.race.februaryRule':'Las inscripciones cierran {{days}} días antes de la salida','richReports.race.entryFeeRetained':'Retenida (no reembolsada)','richReports.race.outcomeRemoved':'Retirado antes/en la salida','richReports.race.problemJerseys':'No hay suficientes kits de maillot elegibles',
},
'it': {
'categories.stagePlanReminders':'Promemoria per i piani di tappa','categories.raceApplicationResults':'Esiti delle iscrizioni alle gare','templateLocalization.genericMessage':'È disponibile una nuova notifica su «{{topic}}» per il tuo club.',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Riepilogo giornaliero delle iscrizioni alle gare','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Rapporto giornaliero sulla preparazione gara','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Rapporto giornaliero sulla pianificazione delle tappe','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Rapporto giornaliero sulla salute dei corridori','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Iscrizioni alle gare aperte','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Le iscrizioni alle gare chiudono presto','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Modifica delle scadenze di iscrizione','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Squadra rimossa dalla gara','semanticTypeTitles.RACE_PLAN_FINALISED':'Piano gara finalizzato','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Promemoria: manca il piano di tappa',
'richReports.common.none':'Nessuno','richReports.common.more':'+ altri {{count}}','richReports.common.stageNumber':'Tappa {{number}}','richReports.common.stage':'Tappa','richReports.common.lockDate':'blocco {{date}}','richReports.common.riderDeadlineDate':'scadenza corridori {{date}}','richReports.common.closesToday':'chiude oggi','richReports.common.fatigueValue':'fatica {{value}}','richReports.common.statusInjured':'Infortunato','richReports.common.statusSick':'Malato','richReports.common.statusNotFullyFit':'Non completamente in forma','richReports.common.statusRecovered':'Recuperato','richReports.common.raceFallback':'Gara','richReports.common.riderFallback':'Corridore','richReports.common.teamFallback':'La tua squadra','richReports.common.thisRace':'questa gara',
'richReports.daily.application.intro':'Riepilogo iscrizioni di oggi — finestre aperte: {{open}}; chiudono entro 3 giorni: {{closing}}{{closingNames}}; in attesa di decisione: {{pending}}.','richReports.daily.application.open':'Finestre di iscrizione aperte','richReports.daily.application.closing':'Chiudono entro 3 giorni','richReports.daily.application.next':'Prossime scadenze di iscrizione','richReports.daily.application.pending':'In attesa di decisione','richReports.daily.application.extra':'Fai clic sul nome di una gara per aprirne i dettagli oppure apri il Calendario per confrontare tutte le iscrizioni disponibili.',
'richReports.daily.preparation.intro':'Riepilogo preparazione gare di oggi — richiedono attenzione: {{attention}}; aperte o in corso: {{open}}; finalizzate: {{finalised}}.{{priority}}','richReports.daily.preparation.priority':' Attenzione immediata: {{items}}.','richReports.daily.preparation.attention':'Richiedono attenzione','richReports.daily.preparation.open':'Aperte / in corso','richReports.daily.preparation.finalised':'Finalizzate','richReports.daily.preparation.extra':'Apri Preparazione gara e risolvi tutto ciò che richiede attenzione prima della scadenza di invio dei corridori.',
'richReports.daily.stage.intro':'Riepilogo pianificazione tappe di oggi — mancanti al blocco: {{missing}}; in blocco a breve: {{soon}}; aperti: {{open}}; bloccati di recente: {{locked}}.{{priority}}','richReports.daily.stage.priority':' Priorità: {{items}}.','richReports.daily.stage.missing':'Mancanti al blocco','richReports.daily.stage.soon':'In blocco a breve','richReports.daily.stage.open':'Piani di tappa aperti','richReports.daily.stage.locked':'Bloccati di recente','richReports.daily.stage.extra':'Apri i Piani di tappa e completa prima le scadenze più vicine. Un piano mancante al momento del blocco può influire direttamente sull’esecuzione della gara.',
'richReports.daily.health.noIssues':'Oggi non sono stati registrati nuovi infortuni, malattie, problemi di forma o recuperi. Nessun corridore richiede attualmente attenzione medica o di forma fisica.','richReports.daily.health.intro':'Riepilogo medico di oggi — infortunati: {{injured}}; malati: {{sick}}; non completamente in forma: {{notFullyFit}}; recuperati: {{recovered}}; richiedono attenzione: {{issues}}.','richReports.daily.health.injuries':'Nuovi infortuni','richReports.daily.health.sick':'Malati oggi','richReports.daily.health.notFullyFit':'Non completamente in forma oggi','richReports.daily.health.recovered':'Recuperati oggi','richReports.daily.health.current':'Attenzione medica / di forma attuale','richReports.daily.health.extra':'Apri la Squadra per controllare disponibilità, recupero e qualsiasi limitazione medica o di forma dei corridori.',
'richReports.race.windowOpenOne':'{{raceName}} ora accetta iscrizioni. Controlla la pagina gara, le regole di partecipazione, il percorso, la scadenza e la prontezza della squadra prima di inviare l’iscrizione.','richReports.race.windowOpenMany':'Sono aperte {{count}} finestre di iscrizione{{races}}. Controlla il Calendario, le regole, le scadenze e la prontezza della squadra prima di iscriverti.','richReports.race.closingSoonOne':'Una finestra di iscrizione chiude tra 3 giorni{{races}}. Controlla la gara, la disponibilità della squadra e l’equipaggiamento e invia l’iscrizione entro la scadenza.','richReports.race.closingSoonMany':'{{count}} finestre di iscrizione chiudono tra 3 giorni{{races}}. Controlla le gare, la disponibilità della squadra e l’equipaggiamento e invia le iscrizioni entro le scadenze.','richReports.race.ruleChange':'Le regole delle scadenze di iscrizione sono state aggiornate. Le gare di fine gennaio usano una finestra di {{lateDays}} giorni; da febbraio le iscrizioni chiudono {{standardDays}} giorni prima della gara. Controlla la pianificazione per non perdere future iscrizioni.','richReports.race.teamRemoved':'{{team}} è stata rimossa automaticamente da {{race}} perché non soddisfaceva il requisito obbligatorio dei kit maglia gara{{stagePart}}.{{stockPart}} La rimozione vale per la tappa interessata e tutte quelle successive, quindi squadra e corridori non possono più ottenere piazzamenti o punti in questa gara.','richReports.race.stagePart':' prima della tappa {{stage}}','richReports.race.stockPart':' Necessari: {{required}}; disponibili: {{available}}.','richReports.race.prestart':'{{team}} è stata rimossa da {{race}} al controllo obbligatorio pre-partenza perché non disponeva di abbastanza kit maglia gara idonei.{{stockPart}} È un errore di preparazione controllabile dal club, quindi sono state applicate le normali conseguenze della mancata partenza.','richReports.race.prestartStock':' Il controllo ha registrato: {{required}} necessari, {{available}} idonei{{missingPart}}.','richReports.race.prestartMissing':', {{missing}} mancanti','richReports.race.extraRemoved':'Apri Equipaggiamento per controllare l’inventario ed evitare lo stesso problema nelle gare future.','richReports.race.extraOpenOne':'Apri la pagina gara, controlla i requisiti e iscriviti in anticipo.','richReports.race.extraOpenMany':'Apri il Calendario, controlla tutte le gare appena aperte e iscriviti in anticipo.','richReports.race.extraClosing':'Apri il Calendario, confronta le gare e iscriviti prima della chiusura delle finestre.','richReports.race.extraRule':'Apri il Calendario, controlla le gare da febbraio e adatta in anticipo il piano iscrizioni.','richReports.race.extraPrestart':'La penalità è già stata applicata. Apri la gara per il contesto oppure vai direttamente alle Scorte gara per controllare le maglie idonee ed evitare lo stesso problema in futuro.','richReports.race.removedRemaining':'Rimossa per il resto della gara','richReports.race.closesInDays':'Chiude tra {{days}} giorni','richReports.race.lateJanuaryRule':'Le iscrizioni chiudono {{days}} giorni prima della partenza','richReports.race.februaryRule':'Le iscrizioni chiudono {{days}} giorni prima della partenza','richReports.race.entryFeeRetained':'Trattenuta (non rimborsata)','richReports.race.outcomeRemoved':'Rimossa prima/alla partenza','richReports.race.problemJerseys':'Kit maglia gara idonei insufficienti',
},
'fr': {
'categories.stagePlanReminders':'Rappels des plans d’étape','categories.raceApplicationResults':'Résultats des inscriptions aux courses','templateLocalization.genericMessage':'Une nouvelle notification « {{topic}} » est disponible pour votre club.',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Récapitulatif quotidien des inscriptions aux courses','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Rapport quotidien de préparation des courses','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Rapport quotidien de planification des étapes','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Rapport quotidien sur la santé des coureurs','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Inscriptions aux courses ouvertes','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Les inscriptions aux courses ferment bientôt','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Modification des échéances d’inscription','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Équipe retirée de la course','semanticTypeTitles.RACE_PLAN_FINALISED':'Plan de course finalisé','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Rappel : plan d’étape manquant',
'richReports.common.none':'Aucun','richReports.common.more':'+ {{count}} autres','richReports.common.stageNumber':'Étape {{number}}','richReports.common.stage':'Étape','richReports.common.lockDate':'verrouillage {{date}}','richReports.common.riderDeadlineDate':'échéance coureurs {{date}}','richReports.common.closesToday':'ferme aujourd’hui','richReports.common.fatigueValue':'fatigue {{value}}','richReports.common.statusInjured':'Blessé','richReports.common.statusSick':'Malade','richReports.common.statusNotFullyFit':'Pas complètement en forme','richReports.common.statusRecovered':'Rétabli','richReports.common.raceFallback':'Course','richReports.common.riderFallback':'Coureur','richReports.common.teamFallback':'Votre équipe','richReports.common.thisRace':'cette course',
'richReports.daily.application.intro':'Récapitulatif des inscriptions du jour — fenêtres ouvertes : {{open}} ; ferment dans les 3 prochains jours : {{closing}}{{closingNames}} ; en attente de décision : {{pending}}.','richReports.daily.application.open':'Fenêtres d’inscription ouvertes','richReports.daily.application.closing':'Ferment dans les 3 prochains jours','richReports.daily.application.next':'Prochaines échéances d’inscription','richReports.daily.application.pending':'En attente de décision','richReports.daily.application.extra':'Cliquez sur le nom d’une course pour ouvrir ses détails, ou ouvrez le Calendrier pour comparer toutes les inscriptions disponibles.',
'richReports.daily.preparation.intro':'Récapitulatif de préparation du jour — nécessitent une attention : {{attention}} ; ouvertes ou en cours : {{open}} ; finalisées : {{finalised}}.{{priority}}','richReports.daily.preparation.priority':' À vérifier immédiatement : {{items}}.','richReports.daily.preparation.attention':'Nécessitent une attention','richReports.daily.preparation.open':'Ouvertes / en cours','richReports.daily.preparation.finalised':'Finalisées','richReports.daily.preparation.extra':'Ouvrez Préparation de course et résolvez tout ce qui demande une attention avant l’échéance d’inscription des coureurs.',
'richReports.daily.stage.intro':'Récapitulatif de planification des étapes du jour — manquants au verrouillage : {{missing}} ; bientôt verrouillés : {{soon}} ; ouverts : {{open}} ; verrouillés récemment : {{locked}}.{{priority}}','richReports.daily.stage.priority':' Priorité : {{items}}.','richReports.daily.stage.missing':'Manquants au verrouillage','richReports.daily.stage.soon':'Bientôt verrouillés','richReports.daily.stage.open':'Plans d’étape ouverts','richReports.daily.stage.locked':'Verrouillés récemment','richReports.daily.stage.extra':'Ouvrez les Plans d’étape et traitez d’abord les échéances les plus proches. Un plan manquant au verrouillage peut affecter directement le déroulement de la course.',
'richReports.daily.health.noIssues':'Aucune nouvelle blessure, maladie, baisse de forme ou guérison n’a été enregistrée aujourd’hui. Aucun coureur ne nécessite actuellement d’attention médicale ou physique.','richReports.daily.health.intro':'Récapitulatif médical du jour — blessés : {{injured}} ; malades : {{sick}} ; pas complètement en forme : {{notFullyFit}} ; rétablis : {{recovered}} ; nécessitent actuellement une attention : {{issues}}.','richReports.daily.health.injuries':'Nouvelles blessures','richReports.daily.health.sick':'Malades aujourd’hui','richReports.daily.health.notFullyFit':'Pas complètement en forme aujourd’hui','richReports.daily.health.recovered':'Rétablis aujourd’hui','richReports.daily.health.current':'Attention médicale / physique actuelle','richReports.daily.health.extra':'Ouvrez l’Équipe pour vérifier la disponibilité, la récupération et les éventuelles restrictions médicales ou physiques des coureurs.',
'richReports.race.windowOpenOne':'{{raceName}} accepte maintenant les inscriptions. Consultez la page de la course, les règles d’entrée, le parcours, l’échéance et la disponibilité de l’équipe avant de vous inscrire.','richReports.race.windowOpenMany':'{{count}} fenêtres d’inscription sont maintenant ouvertes{{races}}. Consultez le Calendrier, les règles, les échéances et la disponibilité de l’équipe avant de vous inscrire.','richReports.race.closingSoonOne':'Une fenêtre d’inscription ferme dans 3 jours{{races}}. Vérifiez la course, la disponibilité de l’équipe et l’équipement et inscrivez-vous avant l’échéance.','richReports.race.closingSoonMany':'{{count}} fenêtres d’inscription ferment dans 3 jours{{races}}. Vérifiez les courses, la disponibilité de l’équipe et l’équipement et inscrivez-vous avant les échéances.','richReports.race.ruleChange':'Les règles d’échéance des inscriptions ont été mises à jour. Les courses de fin janvier utilisent une fenêtre de {{lateDays}} jours ; à partir de février, les inscriptions ferment {{standardDays}} jours avant la course. Vérifiez votre planification pour ne manquer aucune inscription.','richReports.race.teamRemoved':'{{team}} a été automatiquement retirée de {{race}} car l’exigence obligatoire de maillots de course{{stagePart}} n’était pas satisfaite.{{stockPart}} Le retrait s’applique à l’étape concernée et à toutes les suivantes ; l’équipe et ses coureurs ne peuvent plus obtenir de classement ni marquer de points dans cette course.','richReports.race.stagePart':' avant l’étape {{stage}}','richReports.race.stockPart':' Requis : {{required}} ; disponibles : {{available}}.','richReports.race.prestart':'{{team}} a été retirée de {{race}} lors du contrôle obligatoire avant le départ, faute d’un nombre suffisant de kits de maillot admissibles.{{stockPart}} Il s’agit d’un défaut de préparation contrôlable par le club ; les conséquences habituelles d’un départ manqué ont donc été appliquées.','richReports.race.prestartStock':' Le contrôle a relevé : {{required}} requis, {{available}} admissibles{{missingPart}}.','richReports.race.prestartMissing':', {{missing}} manquants','richReports.race.extraRemoved':'Ouvrez Équipement pour vérifier l’inventaire et éviter le même problème lors des prochaines courses.','richReports.race.extraOpenOne':'Ouvrez la page de la course, vérifiez les conditions et inscrivez-vous suffisamment tôt.','richReports.race.extraOpenMany':'Ouvrez le Calendrier, vérifiez toutes les courses nouvellement ouvertes et inscrivez-vous suffisamment tôt.','richReports.race.extraClosing':'Ouvrez le Calendrier, comparez les courses et inscrivez-vous avant la fermeture des fenêtres.','richReports.race.extraRule':'Ouvrez le Calendrier, vérifiez les courses à partir de février et adaptez votre plan d’inscription suffisamment tôt.','richReports.race.extraPrestart':'La pénalité a déjà été appliquée. Ouvrez la course pour le contexte ou allez directement aux Fournitures de course afin de vérifier les maillots admissibles et d’éviter le même problème à l’avenir.','richReports.race.removedRemaining':'Retirée pour le reste de la course','richReports.race.closesInDays':'Ferme dans {{days}} jours','richReports.race.lateJanuaryRule':'Les inscriptions ferment {{days}} jours avant le départ','richReports.race.februaryRule':'Les inscriptions ferment {{days}} jours avant le départ','richReports.race.entryFeeRetained':'Conservée (non remboursée)','richReports.race.outcomeRemoved':'Retirée avant/au départ','richReports.race.problemJerseys':'Nombre insuffisant de kits de maillot admissibles',
},
'ru': {
'categories.stagePlanReminders':'Напоминания о планах этапов','categories.raceApplicationResults':'Результаты заявок на гонки','templateLocalization.genericMessage':'Для вашего клуба доступно новое уведомление «{{topic}}».',
'semanticTypeTitles.RACE_APPLICATION_DAILY_UPDATE':'Ежедневный обзор заявок на гонки','semanticTypeTitles.RACE_PREPARATION_DAILY_REPORT':'Ежедневный отчёт о подготовке к гонкам','semanticTypeTitles.STAGE_PLANNING_DAILY_REPORT':'Ежедневный отчёт о планировании этапов','semanticTypeTitles.RIDER_HEALTH_DAILY_REPORT':'Ежедневный отчёт о здоровье гонщиков','semanticTypeTitles.RACE_APPLICATION_WINDOW_OPEN':'Приём заявок на гонки открыт','semanticTypeTitles.RACE_APPLICATION_CLOSING_SOON':'Приём заявок скоро закрывается','semanticTypeTitles.RACE_APPLICATION_RULE_CHANGE':'Изменение сроков подачи заявок','semanticTypeTitles.RACE_TEAM_DISQUALIFIED_JERSEYS':'Команда снята с гонки','semanticTypeTitles.RACE_PLAN_FINALISED':'План гонки завершён','semanticTypeTitles.STAGE_PLAN_MISSING_REMINDER':'Напоминание: отсутствует план этапа',
'richReports.common.none':'Нет','richReports.common.more':'+ ещё {{count}}','richReports.common.stageNumber':'Этап {{number}}','richReports.common.stage':'Этап','richReports.common.lockDate':'блокировка {{date}}','richReports.common.riderDeadlineDate':'срок состава {{date}}','richReports.common.closesToday':'закрывается сегодня','richReports.common.fatigueValue':'усталость {{value}}','richReports.common.statusInjured':'Травмирован','richReports.common.statusSick':'Болен','richReports.common.statusNotFullyFit':'Не полностью готов','richReports.common.statusRecovered':'Восстановился','richReports.common.raceFallback':'Гонка','richReports.common.riderFallback':'Гонщик','richReports.common.teamFallback':'Ваша команда','richReports.common.thisRace':'эта гонка',
'richReports.daily.application.intro':'Обзор заявок на сегодня — открытых окон: {{open}}; закрываются в течение 3 дней: {{closing}}{{closingNames}}; ожидают решения: {{pending}}.','richReports.daily.application.open':'Открытые окна подачи заявок','richReports.daily.application.closing':'Закрываются в течение 3 дней','richReports.daily.application.next':'Ближайшие сроки подачи заявок','richReports.daily.application.pending':'Ожидают решения','richReports.daily.application.extra':'Нажмите на название гонки выше, чтобы открыть её страницу, или откройте Календарь, чтобы сравнить все доступные заявки.',
'richReports.daily.preparation.intro':'Обзор подготовки к гонкам на сегодня — требуют внимания: {{attention}}; открыты или в работе: {{open}}; завершены: {{finalised}}.{{priority}}','richReports.daily.preparation.priority':' Срочно проверить: {{items}}.','richReports.daily.preparation.attention':'Требуют внимания','richReports.daily.preparation.open':'Открыты / в работе','richReports.daily.preparation.finalised':'Завершены','richReports.daily.preparation.extra':'Откройте Подготовку к гонке и решите все вопросы, требующие внимания, до срока подачи состава.',
'richReports.daily.stage.intro':'Обзор планирования этапов на сегодня — отсутствуют к блокировке: {{missing}}; скоро блокируются: {{soon}}; открыты: {{open}}; недавно заблокированы: {{locked}}.{{priority}}','richReports.daily.stage.priority':' Приоритет: {{items}}.','richReports.daily.stage.missing':'Отсутствуют к блокировке','richReports.daily.stage.soon':'Скоро блокируются','richReports.daily.stage.open':'Открытые планы этапов','richReports.daily.stage.locked':'Недавно заблокированы','richReports.daily.stage.extra':'Откройте Планы этапов и сначала завершите ближайшие по сроку. Отсутствующий к моменту блокировки план может напрямую повлиять на проведение гонки.',
'richReports.daily.health.noIssues':'Сегодня не зарегистрировано новых травм, заболеваний, проблем с формой или восстановлений. Ни одному гонщику сейчас не требуется медицинское внимание или контроль формы.','richReports.daily.health.intro':'Медицинский обзор на сегодня — травмированы: {{injured}}; больны: {{sick}}; не полностью готовы: {{notFullyFit}}; восстановились: {{recovered}}; сейчас требуют внимания: {{issues}}.','richReports.daily.health.injuries':'Новые травмы','richReports.daily.health.sick':'Заболели сегодня','richReports.daily.health.notFullyFit':'Сегодня не полностью готовы','richReports.daily.health.recovered':'Восстановились сегодня','richReports.daily.health.current':'Текущее медицинское внимание / контроль формы','richReports.daily.health.extra':'Откройте Состав, чтобы проверить доступность гонщиков, восстановление и медицинские ограничения или ограничения по форме.',
'richReports.race.windowOpenOne':'{{raceName}} теперь принимает заявки. Проверьте страницу гонки, правила участия, маршрут, срок подачи и готовность состава перед отправкой заявки.','richReports.race.windowOpenMany':'Сейчас открыто окон подачи заявок: {{count}}{{races}}. Проверьте Календарь, правила, сроки и готовность состава перед подачей.','richReports.race.closingSoonOne':'Одно окно подачи заявки закроется через 3 дня{{races}}. Проверьте гонку, доступность состава и готовность экипировки и подайте заявку до срока.','richReports.race.closingSoonMany':'Окон подачи заявок, закрывающихся через 3 дня: {{count}}{{races}}. Проверьте гонки, доступность состава и готовность экипировки и подайте заявки до сроков.','richReports.race.ruleChange':'Правила сроков подачи заявок обновлены. Для гонок конца января действует окно {{lateDays}} дня; с февраля заявки закрываются за {{standardDays}} дней до гонки. Проверьте планирование, чтобы не пропустить будущие заявки.','richReports.race.teamRemoved':'{{team}} автоматически снята с {{race}}, поскольку обязательное требование по комплектам гоночной формы{{stagePart}} не было выполнено.{{stockPart}} Снятие действует на затронутый этап и все оставшиеся этапы, поэтому команда и её гонщики больше не могут занимать места или получать очки в этой гонке.','richReports.race.stagePart':' перед этапом {{stage}}','richReports.race.stockPart':' Требуется: {{required}}; доступно: {{available}}.','richReports.race.prestart':'{{team}} снята с {{race}} при обязательной проверке перед стартом из-за недостаточного количества доступных комплектов гоночной формы.{{stockPart}} Это контролируемая клубом ошибка подготовки, поэтому применены обычные последствия пропуска старта.','richReports.race.prestartStock':' Проверка показала: требуется {{required}}, доступно {{available}}{{missingPart}}.','richReports.race.prestartMissing':', не хватает {{missing}}','richReports.race.extraRemoved':'Откройте Экипировку, чтобы проверить запасы и избежать той же проблемы в будущих гонках.','richReports.race.extraOpenOne':'Откройте страницу гонки, проверьте требования и подайте заявку заранее.','richReports.race.extraOpenMany':'Откройте Календарь, проверьте все недавно открытые гонки и подайте заявки заранее.','richReports.race.extraClosing':'Откройте Календарь, сравните гонки и подайте заявки до закрытия окон.','richReports.race.extraRule':'Откройте Календарь, проверьте гонки с февраля и заранее скорректируйте план заявок.','richReports.race.extraPrestart':'Штраф уже применён. Откройте гонку для контекста или сразу перейдите к Запасам для гонок, чтобы проверить доступную форму и избежать той же проблемы в будущем.','richReports.race.removedRemaining':'Снята до конца гонки','richReports.race.closesInDays':'Закрывается через {{days}} дн.','richReports.race.lateJanuaryRule':'Заявки закрываются за {{days}} дн. до старта','richReports.race.februaryRule':'Заявки закрываются за {{days}} дн. до старта','richReports.race.entryFeeRetained':'Удержан (не возвращён)','richReports.race.outcomeRemoved':'Снята до/на старте гонки','richReports.race.problemJerseys':'Недостаточно доступных комплектов гоночной формы',
},
}

for locale in LOCALES:
    path = ROOT / 'src' / 'i18n' / 'locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    for key, value in T[locale].items():
        set_path(data, key, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Export a safe notification-namespace translator for rich templates.
loc = ROOT / 'src' / 'features' / 'notifications' / 'notificationLocalization.ts'
text = loc.read_text(encoding='utf-8')
anchor = "function nt(key: string, options?: Record<string, unknown>): string {\n  return String(i18n.t(key, { ns: 'notifications', ...(options ?? {}) }))\n}\n"
if anchor not in text:
    raise SystemExit('notificationLocalization nt() anchor not found')
replacement = anchor + "\nexport function translateNotificationKey(\n  key: string,\n  options?: Record<string, unknown>\n): string {\n  return nt(key, options)\n}\n"
text = text.replace(anchor, replacement, 1)
loc.write_text(text, encoding='utf-8')

# Replace rich-notification English composition with semantic translations.
p = ROOT / 'src' / 'features' / 'notifications' / 'notificationTemplates.tsx'
s = p.read_text(encoding='utf-8')
s = s.replace(
"  localizeNotificationValue,\n} from './notificationLocalization'",
"  localizeNotificationValue,\n  translateNotificationKey,\n} from './notificationLocalization'",
1)


def replace_between(src: str, start: str, end: str, replacement: str) -> str:
    a = src.find(start)
    if a < 0: raise SystemExit(f'start marker not found: {start}')
    b = src.find(end, a)
    if b < 0: raise SystemExit(f'end marker not found: {end}')
    return src[:a] + replacement.rstrip() + '\n\n' + src[b:]

helpers = r'''function listWithRemainder(values: string[], max = 6): string {
  const cleaned = values.map(value => value.trim()).filter(Boolean)
  if (cleaned.length === 0) return translateNotificationKey('richReports.common.none')
  if (cleaned.length <= max) return cleaned.join(', ')
  return `${cleaned.slice(0, max).join(', ')} ${translateNotificationKey('richReports.common.more', { count: cleaned.length - max })}`
}

function formatShortGameDate(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const match = text.match(/^\d{4}-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/)
  if (!match) return text || null
  const date = `${match[2]}.${match[1]}.`
  return match[3] && match[4] ? `${date} ${match[3]}:${match[4]}` : date
}

function raceLabel(row: Record<string, unknown>, options?: { deadline?: boolean }): string {
  const name = String(row.race_name ?? row.name ?? translateNotificationKey('richReports.common.raceFallback')).trim()
  if (!options?.deadline) return name

  const category = String(row.category ?? row.race_category ?? '').trim()
  if (category) return `${name} (${category})`

  const days = Number(row.days_until_close)
  if (Number.isFinite(days)) {
    if (days <= 0) return `${name} (${translateNotificationKey('richReports.common.closesToday')})`
    return `${name} (${days}d)`
  }
  const close = formatShortGameDate(row.applications_close)
  return close ? `${name} (${close})` : name
}

function raceInlineLinks(
  rows: Record<string, unknown>[],
  max = 8,
  prefix = ''
): string {
  const visible = rows.slice(0, max)
  if (visible.length === 0) return translateNotificationKey('richReports.common.none')

  return (
    <>
      {prefix}
      {visible.map((row, index) => {
        const raceId = String(row.race_id ?? row.id ?? '').trim()
        const label = raceLabel(row, { deadline: true })

        return (
          <span key={`${raceId || label}-${index}`}>
            {index > 0 ? ', ' : null}
            {raceId ? (
              <Link
                to={`/dashboard/races/${raceId}`}
                className="underline decoration-slate-400 underline-offset-2 hover:text-sky-700"
              >
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        )
      })}
      {rows.length > max ? ` ${translateNotificationKey('richReports.common.more', { count: rows.length - max })}` : null}
    </>
  ) as unknown as string
}

function prepRaceLabel(row: Record<string, unknown>): string {
  const name = String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback')).trim()
  const deadline = formatShortGameDate(row.rider_deadline)
  return deadline
    ? `${name} — ${translateNotificationKey('richReports.common.riderDeadlineDate', { date: deadline })}`
    : name
}

function stageLabel(row: Record<string, unknown>): string {
  const race = String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback')).trim()
  const stageNumber = Number(row.stage_number)
  const stageName = String(row.stage_name ?? '').trim()
  const stage = Number.isFinite(stageNumber)
    ? `${translateNotificationKey('richReports.common.stageNumber', { number: stageNumber })}${stageName && !/^stage\s+\d+$/i.test(stageName) ? `: ${stageName}` : ''}`
    : stageName || translateNotificationKey('richReports.common.stage')
  const lockAt = formatShortGameDate(row.lock_at)
  return `${race} — ${stage}${lockAt ? ` (${translateNotificationKey('richReports.common.lockDate', { date: lockAt })})` : ''}`
}

function healthRiderLabel(row: Record<string, unknown>): string {
  const name = String(row.rider_name ?? row.rider_full_name ?? translateNotificationKey('richReports.common.riderFallback')).trim()
  const normalizedStatus = String(row.status ?? row.event ?? '').toLowerCase().replace(/[-\s]+/g, '_').trim()
  const statusKeyByCode: Record<string, string> = {
    rider_injured: 'richReports.common.statusInjured', injured: 'richReports.common.statusInjured',
    rider_sick: 'richReports.common.statusSick', sick: 'richReports.common.statusSick',
    rider_not_fully_fit: 'richReports.common.statusNotFullyFit', not_fully_fit: 'richReports.common.statusNotFullyFit',
    rider_fit_again: 'richReports.common.statusRecovered', recovered: 'richReports.common.statusRecovered',
  }
  const statusKey = statusKeyByCode[normalizedStatus]
  const status = statusKey ? translateNotificationKey(statusKey) : ''
  const fatigue = Number(row.fatigue)
  const reasonRaw = String(row.unavailable_reason ?? '').trim()
  const reason = reasonRaw ? localizeNotificationValue(reasonRaw) : ''
  const extras = [
    status || null,
    Number.isFinite(fatigue) ? translateNotificationKey('richReports.common.fatigueValue', { value: fatigue }) : null,
    reason || null,
  ].filter(Boolean)
  return extras.length > 0 ? `${name} — ${extras.join(', ')}` : name
}'''
s = replace_between(s, 'function listWithRemainder', 'function prestartDisqualificationIntro', helpers)

prestart_intro = r'''function prestartDisqualificationIntro(item: NotificationItem): string {
  const payload = payloadOf(item)
  const race = readString(payload, 'race_name') || translateNotificationKey('richReports.common.thisRace')
  const team = readString(payload, 'club_name', 'team_name') || translateNotificationKey('richReports.common.teamFallback')
  const required = readNumber(payload, 'required_jersey_units')
  const available = readNumber(payload, 'available_jersey_units', 'effective_available_jersey_units')
  const missing = readNumber(payload, 'missing_jersey_units')
  const missingPart = missing !== null
    ? translateNotificationKey('richReports.race.prestartMissing', { missing })
    : ''
  const stockPart = required !== null && available !== null
    ? translateNotificationKey('richReports.race.prestartStock', { required, available, missingPart })
    : ''

  return translateNotificationKey('richReports.race.prestart', { team, race, stockPart })
}'''
s = replace_between(s, 'function prestartDisqualificationIntro', 'function richRaceIntro', prestart_intro)

race_intro = r'''function richRaceIntro(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    const race = readString(payload, 'race_name') || raceNameFromTeamRemovalTitle(item) || translateNotificationKey('richReports.common.thisRace')
    const team = readString(payload, 'team_name') || translateNotificationKey('richReports.common.teamFallback')
    const stage = readNumber(payload, 'stage_number', 'disqualified_from_stage_number')
    const required = readNumber(payload, 'required_jersey_units')
    const available = readNumber(payload, 'available_jersey_units')
    const stagePart = stage !== null ? translateNotificationKey('richReports.race.stagePart', { stage }) : ''
    const stockPart = required !== null && available !== null
      ? translateNotificationKey('richReports.race.stockPart', { required, available })
      : ''
    return translateNotificationKey('richReports.race.teamRemoved', { team, race, stagePart, stockPart })
  }

  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count') ?? 0
    const races = readString(payload, 'race_name', 'sample_races')
    if (count === 1 && races) {
      return translateNotificationKey('richReports.race.windowOpenOne', { raceName: races })
    }
    return translateNotificationKey('richReports.race.windowOpenMany', {
      count,
      races: races ? `: ${races}` : '',
    })
  }

  if (code === 'RACE_APPLICATION_CLOSING_SOON') {
    const count = readNumber(payload, 'closing_count') ?? 0
    const races = readString(payload, 'sample_races')
    return translateNotificationKey(
      count === 1 ? 'richReports.race.closingSoonOne' : 'richReports.race.closingSoonMany',
      { count, races: races ? `: ${races}` : '' }
    )
  }

  if (code === 'RACE_APPLICATION_RULE_CHANGE') {
    const lateDays = readNumber(payload, 'late_january_close_days') ?? 3
    const standardDays = readNumber(payload, 'february_onward_close_days') ?? 7
    return translateNotificationKey('richReports.race.ruleChange', { lateDays, standardDays })
  }

  return null
}'''
s = replace_between(s, 'function richRaceIntro', 'function richDailyIntro', race_intro)

daily_intro = r'''function richDailyIntro(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_APPLICATION_DAILY_UPDATE') {
    const open = readNumber(payload, 'opened_or_open_count', 'open_count') ?? 0
    const closing = readNumber(payload, 'closing_soon_count') ?? 0
    const pending = readNumber(payload, 'pending_count') ?? 0
    const closingRows = readObjectArray(payload, 'closing_soon_races')
    const closingNames = closing > 0 ? `: ${listWithRemainder(closingRows.map(row => raceLabel(row)), 5)}` : ''
    return translateNotificationKey('richReports.daily.application.intro', { open, closing, closingNames, pending })
  }

  if (code === 'RACE_PREPARATION_DAILY_REPORT') {
    const attention = readNumber(payload, 'attention_count') ?? 0
    const open = readNumber(payload, 'open_count') ?? 0
    const finalised = readNumber(payload, 'finalised_count') ?? 0
    const races = readObjectArray(payload, 'races')
    const attentionNames = races
      .filter(row => String(row.report_state ?? '') === 'attention')
      .map(row => String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback')))
    const priority = attentionNames.length > 0
      ? translateNotificationKey('richReports.daily.preparation.priority', { items: listWithRemainder(attentionNames, 4) })
      : ''
    return translateNotificationKey('richReports.daily.preparation.intro', { attention, open, finalised, priority })
  }

  if (code === 'STAGE_PLANNING_DAILY_REPORT') {
    const missing = readNumber(payload, 'missing_at_lock_count') ?? 0
    const soon = readNumber(payload, 'lock_soon_count') ?? 0
    const open = readNumber(payload, 'open_count') ?? 0
    const locked = readNumber(payload, 'locked_count') ?? 0
    const stages = readObjectArray(payload, 'stages')
    const priorities = stages
      .filter(row => ['missing_at_lock', 'lock_soon'].includes(String(row.report_state ?? '')))
      .map(row => stageLabel(row))
    const priority = priorities.length > 0
      ? translateNotificationKey('richReports.daily.stage.priority', { items: listWithRemainder(priorities, 3) })
      : ''
    return translateNotificationKey('richReports.daily.stage.intro', { missing, soon, open, locked, priority })
  }

  if (code === 'RIDER_HEALTH_DAILY_REPORT') {
    const injured = readNumber(payload, 'injured_today') ?? 0
    const sick = readNumber(payload, 'sick_today') ?? 0
    const notFullyFit = readNumber(payload, 'not_fully_fit_today') ?? 0
    const recovered = readNumber(payload, 'recovered_today') ?? 0
    const issues = readNumber(payload, 'current_issue_count') ?? 0
    if (injured + sick + notFullyFit + recovered + issues === 0) {
      return translateNotificationKey('richReports.daily.health.noIssues')
    }
    return translateNotificationKey('richReports.daily.health.intro', {
      injured, sick, notFullyFit, recovered, issues,
    })
  }

  return null
}'''
s = replace_between(s, 'function richDailyIntro', 'function localizeRows', daily_intro)

# Replace daily detail rows with semantic labels and already-localized entity values.
daily_rows = r'''function richDailyDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_APPLICATION_DAILY_UPDATE') {
    const open = readNumber(payload, 'opened_or_open_count', 'open_count') ?? 0
    const closing = readNumber(payload, 'closing_soon_count') ?? 0
    const pending = readNumber(payload, 'pending_count') ?? 0
    const openRows = readObjectArray(payload, 'open_races')
    const closingRows = readObjectArray(payload, 'closing_soon_races')
    const pendingRows = readObjectArray(payload, 'pending_applications')
    return [
      { label: translateNotificationKey('richReports.daily.application.open'), value: String(open) },
      { label: translateNotificationKey('richReports.daily.application.closing'), value: closing > 0 ? raceInlineLinks(closingRows, 8, `${closing} — `) : translateNotificationKey('richReports.common.none') },
      { label: translateNotificationKey('richReports.daily.application.next'), value: raceInlineLinks(openRows.slice(0, 8), 8) },
      { label: translateNotificationKey('richReports.daily.application.pending'), value: pending > 0 ? `${pending} — ${listWithRemainder(pendingRows.map(row => String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback'))), 6)}` : translateNotificationKey('richReports.common.none') },
    ]
  }

  if (code === 'RACE_PREPARATION_DAILY_REPORT') {
    const races = readObjectArray(payload, 'races')
    const attention = races.filter(row => String(row.report_state ?? '') === 'attention')
    const open = races.filter(row => String(row.report_state ?? '') === 'open')
    const finalised = races.filter(row => String(row.report_state ?? '') === 'finalised')
    return [
      { label: translateNotificationKey('richReports.daily.preparation.attention'), value: listWithRemainder(attention.map(prepRaceLabel), 6) },
      { label: translateNotificationKey('richReports.daily.preparation.open'), value: listWithRemainder(open.map(prepRaceLabel), 6) },
      { label: translateNotificationKey('richReports.daily.preparation.finalised'), value: listWithRemainder(finalised.map(row => String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback'))), 6) },
    ]
  }

  if (code === 'STAGE_PLANNING_DAILY_REPORT') {
    const stages = readObjectArray(payload, 'stages')
    const missing = stages.filter(row => String(row.report_state ?? '') === 'missing_at_lock')
    const soon = stages.filter(row => String(row.report_state ?? '') === 'lock_soon')
    const open = stages.filter(row => String(row.report_state ?? '') === 'open')
    const locked = stages.filter(row => String(row.report_state ?? '') === 'locked')
    return [
      { label: translateNotificationKey('richReports.daily.stage.missing'), value: listWithRemainder(missing.map(stageLabel), 5) },
      { label: translateNotificationKey('richReports.daily.stage.soon'), value: listWithRemainder(soon.map(stageLabel), 5) },
      { label: translateNotificationKey('richReports.daily.stage.open'), value: listWithRemainder(open.map(stageLabel), 6) },
      { label: translateNotificationKey('richReports.daily.stage.locked'), value: listWithRemainder(locked.map(stageLabel), 5) },
    ]
  }

  if (code === 'RIDER_HEALTH_DAILY_REPORT') {
    const changes = readObjectArray(payload, 'changes_today')
    const current = readObjectArray(payload, 'current_health_issues')
    const injuries = changes.filter(row => String(row.event ?? '') === 'rider_injured')
    const sickness = changes.filter(row => String(row.event ?? '') === 'rider_sick')
    const notFullyFit = changes.filter(row => String(row.event ?? '') === 'rider_not_fully_fit')
    const recovered = changes.filter(row => String(row.event ?? '') === 'rider_fit_again')
    return [
      { label: translateNotificationKey('richReports.daily.health.injuries'), value: listWithRemainder(injuries.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.sick'), value: listWithRemainder(sickness.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.notFullyFit'), value: listWithRemainder(notFullyFit.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.recovered'), value: listWithRemainder(recovered.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.current'), value: listWithRemainder(current.map(healthRiderLabel), 8) },
    ]
  }

  return []
}'''
s = replace_between(s, 'function richDailyDetailRows', 'function prestartDisqualificationExtraText', daily_rows)

extras = r'''function prestartDisqualificationExtraText(): string {
  return translateNotificationKey('richReports.race.extraPrestart')
}

function richRaceExtraText(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    return translateNotificationKey('richReports.race.extraRemoved')
  }
  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count') ?? 0
    return translateNotificationKey(count === 1 ? 'richReports.race.extraOpenOne' : 'richReports.race.extraOpenMany')
  }
  if (code === 'RACE_APPLICATION_CLOSING_SOON') return translateNotificationKey('richReports.race.extraClosing')
  if (code === 'RACE_APPLICATION_RULE_CHANGE') return translateNotificationKey('richReports.race.extraRule')
  return null
}

function richDailyExtraText(item: NotificationItem): string | null {
  const code = codeOf(item)
  if (code === 'RACE_APPLICATION_DAILY_UPDATE') return translateNotificationKey('richReports.daily.application.extra')
  if (code === 'RACE_PREPARATION_DAILY_REPORT') return translateNotificationKey('richReports.daily.preparation.extra')
  if (code === 'STAGE_PLANNING_DAILY_REPORT') return translateNotificationKey('richReports.daily.stage.extra')
  if (code === 'RIDER_HEALTH_DAILY_REPORT') return translateNotificationKey('richReports.daily.health.extra')
  return null
}'''
s = replace_between(s, 'function prestartDisqualificationExtraText', 'function richRaceAction', extras)

# Remove English value leakage in the rich race detail rows.
s = s.replace("value: `Stage ${stage}`", "value: translateNotificationKey('richReports.common.stageNumber', { number: stage })")
s = s.replace("{ label: 'Race status', value: 'Removed for the remaining race' }", "{ label: 'Race status', value: translateNotificationKey('richReports.race.removedRemaining') }")
s = s.replace("{ label: 'Deadline', value: `Closes in ${days} days` }", "{ label: 'Deadline', value: translateNotificationKey('richReports.race.closesInDays', { days }) }")
s = s.replace("{ label: 'Late-January races', value: `Applications close ${lateJanuaryDays} days before the start` }", "{ label: 'Late-January races', value: translateNotificationKey('richReports.race.lateJanuaryRule', { days: lateJanuaryDays }) }")
s = s.replace("{ label: 'February onward', value: `Applications close ${standardDays} days before the start` }", "{ label: 'February onward', value: translateNotificationKey('richReports.race.februaryRule', { days: standardDays }) }")
s = s.replace("const problem = readString(payload, 'problem_label') || 'Not enough eligible Race Jersey Kits'", "const problem = readString(payload, 'problem_label') ? localizeNotificationValue(readString(payload, 'problem_label') || '') : translateNotificationKey('richReports.race.problemJerseys')")
s = s.replace("{ label: 'Race entry fee', value: 'Retained (not refunded)' }", "{ label: 'Race entry fee', value: translateNotificationKey('richReports.race.entryFeeRetained') }")
s = s.replace("{ label: 'Outcome', value: 'Removed before/at race start' }", "{ label: 'Outcome', value: translateNotificationKey('richReports.race.outcomeRemoved') }")

p.write_text(s, encoding='utf-8')
print('Rich notification localization applied for all eight locales.')
