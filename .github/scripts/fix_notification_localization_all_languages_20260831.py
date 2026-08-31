#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']

WORDS = {
'en': {'10':'10','AGAIN':'Again','AGE':'Age','AGENTS':'Agents','ASSET':'Asset','CHIEF':'Chief','CLUB':'Club','CONDITION':'Condition','COUNTERED':'Countered','DEADLINE':'Deadline','DECLINED':'Declined','DEVELOPING':'Developing','DOCTOR':'Doctor','EMERGENCY':'Emergency','FINAL':'Final','FINISHED':'Finished','FIT':'Fit','FULLY':'Fully','INJURED':'Injured','JERSEYS':'Jerseys','LIMIT':'Limit','LIQUIDATED':'Liquidated','LIQUIDATION':'Liquidation','LOAN':'Loan','MANDATORY':'Mandatory','MECHANIC':'Mechanic','NOT':'Not','ORDERED':'Ordered','REACHED':'Reached','RELEASE':'Release','REPAID':'Repaid','REPAIRED':'Repaired','SICK':'Sick','SOLD':'Sold','START':'Start','TO':'To','WELCOME':'Welcome','WINDOW':'Window'},
'sr-Latn': {'10':'10','AGAIN':'Ponovo','AGE':'Godine','AGENTS':'Agenti','ASSET':'Sredstvo','CHIEF':'Glavni','CLUB':'Klub','CONDITION':'Stanje','COUNTERED':'Kontraponuda','DEADLINE':'Rok','DECLINED':'Odbijeno','DEVELOPING':'Razvojni','DOCTOR':'Doktor','EMERGENCY':'Hitni','FINAL':'Završno','FINISHED':'Završen','FIT':'Spreman','FULLY':'Potpuno','INJURED':'Povređen','JERSEYS':'Majice','LIMIT':'Ograničenje','LIQUIDATED':'Likvidiran','LIQUIDATION':'Likvidacija','LOAN':'Kredit','MANDATORY':'Obavezno','MECHANIC':'Mehaničar','NOT':'Nije','ORDERED':'Naručeno','REACHED':'Dostignuto','RELEASE':'Raskid','REPAID':'Otplata','REPAIRED':'Popravljeno','SICK':'Bolestan','SOLD':'Prodato','START':'Početak','TO':'Ka','WELCOME':'Dobrodošlica','WINDOW':'Period'},
'de': {'10':'10','AGAIN':'Wieder','AGE':'Alter','AGENTS':'Agenten','ASSET':'Anlage','CHIEF':'Chef','CLUB':'Club','CONDITION':'Zustand','COUNTERED':'Gegenangebot','DEADLINE':'Frist','DECLINED':'Abgelehnt','DEVELOPING':'Entwicklung','DOCTOR':'Arzt','EMERGENCY':'Notfall','FINAL':'Final','FINISHED':'Beendet','FIT':'Fit','FULLY':'Vollständig','INJURED':'Verletzt','JERSEYS':'Trikots','LIMIT':'Limit','LIQUIDATED':'Aufgelöst','LIQUIDATION':'Liquidation','LOAN':'Darlehen','MANDATORY':'Verpflichtend','MECHANIC':'Mechaniker','NOT':'Nicht','ORDERED':'Bestellt','REACHED':'Erreicht','RELEASE':'Freigabe','REPAID':'Zurückgezahlt','REPAIRED':'Repariert','SICK':'Krank','SOLD':'Verkauft','START':'Start','TO':'An','WELCOME':'Willkommen','WINDOW':'Zeitraum'},
'hr': {'10':'10','AGAIN':'Ponovno','AGE':'Dob','AGENTS':'Agenti','ASSET':'Sredstvo','CHIEF':'Glavni','CLUB':'Klub','CONDITION':'Stanje','COUNTERED':'Protuponuda','DEADLINE':'Rok','DECLINED':'Odbijeno','DEVELOPING':'Razvojni','DOCTOR':'Liječnik','EMERGENCY':'Hitni','FINAL':'Završno','FINISHED':'Završen','FIT':'Spreman','FULLY':'Potpuno','INJURED':'Ozlijedio se','JERSEYS':'Majice','LIMIT':'Ograničenje','LIQUIDATED':'Likvidiran','LIQUIDATION':'Likvidacija','LOAN':'Kredit','MANDATORY':'Obavezno','MECHANIC':'Mehaničar','NOT':'Nije','ORDERED':'Naručeno','REACHED':'Dosegnuto','RELEASE':'Raskid','REPAID':'Otplata','REPAIRED':'Popravljeno','SICK':'Bolestan','SOLD':'Prodano','START':'Početak','TO':'Prema','WELCOME':'Dobrodošlica','WINDOW':'Razdoblje'},
'es': {'10':'10','AGAIN':'De nuevo','AGE':'Edad','AGENTS':'Agentes','ASSET':'Activo','CHIEF':'Jefe','CLUB':'Club','CONDITION':'Estado','COUNTERED':'Contraoferta','DEADLINE':'Fecha límite','DECLINED':'Rechazado','DEVELOPING':'Desarrollo','DOCTOR':'Médico','EMERGENCY':'Emergencia','FINAL':'Final','FINISHED':'Finalizado','FIT':'En forma','FULLY':'Completamente','INJURED':'Lesionado','JERSEYS':'Maillots','LIMIT':'Límite','LIQUIDATED':'Liquidado','LIQUIDATION':'Liquidación','LOAN':'Préstamo','MANDATORY':'Obligatorio','MECHANIC':'Mecánico','NOT':'No','ORDERED':'Pedido','REACHED':'Alcanzado','RELEASE':'Liberación','REPAID':'Reembolsado','REPAIRED':'Reparado','SICK':'Enfermo','SOLD':'Vendido','START':'Inicio','TO':'A','WELCOME':'Bienvenida','WINDOW':'Periodo'},
'it': {'10':'10','AGAIN':'Di nuovo','AGE':'Età','AGENTS':'Agenti','ASSET':'Bene','CHIEF':'Capo','CLUB':'Club','CONDITION':'Condizione','COUNTERED':'Controproposta','DEADLINE':'Scadenza','DECLINED':'Rifiutato','DEVELOPING':'Sviluppo','DOCTOR':'Medico','EMERGENCY':'Emergenza','FINAL':'Finale','FINISHED':'Terminato','FIT':'In forma','FULLY':'Completamente','INJURED':'Infortunato','JERSEYS':'Maglie','LIMIT':'Limite','LIQUIDATED':'Liquidato','LIQUIDATION':'Liquidazione','LOAN':'Prestito','MANDATORY':'Obbligatorio','MECHANIC':'Meccanico','NOT':'Non','ORDERED':'Ordinato','REACHED':'Raggiunto','RELEASE':'Rilascio','REPAID':'Rimborsato','REPAIRED':'Riparato','SICK':'Malato','SOLD':'Venduto','START':'Inizio','TO':'A','WELCOME':'Benvenuto','WINDOW':'Periodo'},
'fr': {'10':'10','AGAIN':'À nouveau','AGE':'Âge','AGENTS':'Agents','ASSET':'Équipement','CHIEF':'Chef','CLUB':'Club','CONDITION':'État','COUNTERED':'Contre-offre','DEADLINE':'Échéance','DECLINED':'Refusé','DEVELOPING':'Développement','DOCTOR':'Médecin','EMERGENCY':'Urgence','FINAL':'Final','FINISHED':'Terminé','FIT':'Apte','FULLY':'Entièrement','INJURED':'Blessé','JERSEYS':'Maillots','LIMIT':'Limite','LIQUIDATED':'Liquidé','LIQUIDATION':'Liquidation','LOAN':'Prêt','MANDATORY':'Obligatoire','MECHANIC':'Mécanicien','NOT':'Non','ORDERED':'Commandé','REACHED':'Atteint','RELEASE':'Libération','REPAID':'Remboursé','REPAIRED':'Réparé','SICK':'Malade','SOLD':'Vendu','START':'Début','TO':'À','WELCOME':'Bienvenue','WINDOW':'Période'},
'ru': {'10':'10','AGAIN':'Снова','AGE':'Возраст','AGENTS':'Агенты','ASSET':'Объект','CHIEF':'Главный','CLUB':'Клуб','CONDITION':'Состояние','COUNTERED':'Встречное предложение','DEADLINE':'Срок','DECLINED':'Отклонено','DEVELOPING':'Развитие','DOCTOR':'Врач','EMERGENCY':'Экстренный','FINAL':'Финальный','FINISHED':'Завершён','FIT':'Готов','FULLY':'Полностью','INJURED':'Травмирован','JERSEYS':'Майки','LIMIT':'Лимит','LIQUIDATED':'Ликвидирован','LIQUIDATION':'Ликвидация','LOAN':'Кредит','MANDATORY':'Обязательно','MECHANIC':'Механик','NOT':'Не','ORDERED':'Заказано','REACHED':'Достигнуто','RELEASE':'Освобождение','REPAID':'Погашено','REPAIRED':'Отремонтировано','SICK':'Болен','SOLD':'Продано','START':'Начало','TO':'К','WELCOME':'Добро пожаловать','WINDOW':'Период'},
}

FEED = {
'en': {
  'teamUpdateTitle':'Team update','teamUpdateMessage':'Open Notifications for the full details of this team update.',
  'sponsorKinds':{'main':'main','secondary':'secondary','technical':'technical'},
  'sponsorSigned':{'title':'{{name}} signed as {{kind}} sponsor','seasonMessage':'{{name}} is now your {{kind}} sponsor for Season {{season}}.','guaranteedMessage':'{{name}} is now your {{kind}} sponsor for Season {{season}}. Guaranteed payment: {{amount}}.','technicalMessage':'{{name}} is now your {{kind}} sponsor for Season {{season}}. Cash paid now: {{cash}}. Equipment support fund: {{fund}}.','genericMessage':'{{name}} is now your {{kind}} sponsor.'},
  'scoutAdvisory':{'title':'Scout Advisory — Recruitment & Scouting Review','message':'Recruitment review: {{reports}} completed scouting reports, {{recent}} completed in the last seven real-life days, {{highElite}} High or Elite potential reports, and {{active}} active scouting assignments.','genericMessage':'Your Scout has prepared a recruitment and scouting review.'},
  'sponsorOffersReady':{'title':'Sponsor offers ready for Season {{season}}','message':'New sponsor offers are available for your team. Choose your sponsors for the current season.'}
},
'sr-Latn': {
  'teamUpdateTitle':'Ažuriranje tima','teamUpdateMessage':'Otvorite Obaveštenja za sve detalje ovog ažuriranja tima.',
  'sponsorKinds':{'main':'glavni','secondary':'sekundarni','technical':'tehnički'},
  'sponsorSigned':{'title':'{{name}} je potpisan kao {{kind}} sponzor','seasonMessage':'{{name}} je sada vaš {{kind}} sponzor za sezonu {{season}}.','guaranteedMessage':'{{name}} je sada vaš {{kind}} sponzor za sezonu {{season}}. Garantovana isplata: {{amount}}.','technicalMessage':'{{name}} je sada vaš {{kind}} sponzor za sezonu {{season}}. Isplaćeno odmah: {{cash}}. Fond za opremu: {{fund}}.','genericMessage':'{{name}} je sada vaš {{kind}} sponzor.'},
  'scoutAdvisory':{'title':'Savet skauta — pregled regrutovanja i skautinga','message':'Pregled regrutovanja: završeno je {{reports}} skautskih izveštaja, {{recent}} u poslednjih sedam dana u stvarnom vremenu, {{highElite}} izveštaja sa visokim ili elitnim potencijalom i {{active}} aktivnih skautskih zadataka.','genericMessage':'Vaš skaut je pripremio pregled regrutovanja i skautinga.'},
  'sponsorOffersReady':{'title':'Ponude sponzora spremne za sezonu {{season}}','message':'Nove ponude sponzora dostupne su vašem timu. Izaberite sponzore za tekuću sezonu.'}
},
'de': {
  'teamUpdateTitle':'Team-Update','teamUpdateMessage':'Öffne die Benachrichtigungen, um alle Details zu diesem Team-Update zu sehen.',
  'sponsorKinds':{'main':'Haupt','secondary':'Sekundär','technical':'Technik'},
  'sponsorSigned':{'title':'{{name}} als {{kind}}sponsor verpflichtet','seasonMessage':'{{name}} ist jetzt dein {{kind}}sponsor für Saison {{season}}.','guaranteedMessage':'{{name}} ist jetzt dein {{kind}}sponsor für Saison {{season}}. Garantierte Zahlung: {{amount}}.','technicalMessage':'{{name}} ist jetzt dein {{kind}}sponsor für Saison {{season}}. Sofortzahlung: {{cash}}. Ausrüstungsfonds: {{fund}}.','genericMessage':'{{name}} ist jetzt dein {{kind}}sponsor.'},
  'scoutAdvisory':{'title':'Scout-Beratung — Rekrutierungs- und Scoutingbericht','message':'Rekrutierungsbericht: {{reports}} abgeschlossene Scoutingberichte, davon {{recent}} in den letzten sieben Echtzeittagen, {{highElite}} Berichte mit hohem oder Elite-Potenzial und {{active}} aktive Scoutingaufträge.','genericMessage':'Dein Scout hat einen Rekrutierungs- und Scoutingbericht erstellt.'},
  'sponsorOffersReady':{'title':'Sponsorenangebote für Saison {{season}} verfügbar','message':'Neue Sponsorenangebote sind für dein Team verfügbar. Wähle deine Sponsoren für die aktuelle Saison.'}
},
'hr': {
  'teamUpdateTitle':'Ažuriranje tima','teamUpdateMessage':'Otvorite Obavijesti za sve detalje ovog ažuriranja tima.',
  'sponsorKinds':{'main':'glavni','secondary':'sekundarni','technical':'tehnički'},
  'sponsorSigned':{'title':'{{name}} potpisan kao {{kind}} sponzor','seasonMessage':'{{name}} je sada vaš {{kind}} sponzor za sezonu {{season}}.','guaranteedMessage':'{{name}} je sada vaš {{kind}} sponzor za sezonu {{season}}. Zajamčena isplata: {{amount}}.','technicalMessage':'{{name}} je sada vaš {{kind}} sponzor za sezonu {{season}}. Isplaćeno odmah: {{cash}}. Fond za opremu: {{fund}}.','genericMessage':'{{name}} je sada vaš {{kind}} sponzor.'},
  'scoutAdvisory':{'title':'Savjet skauta — pregled regrutiranja i skautinga','message':'Pregled regrutiranja: završeno je {{reports}} skautskih izvještaja, {{recent}} u posljednjih sedam dana u stvarnom vremenu, {{highElite}} izvještaja s visokim ili elitnim potencijalom i {{active}} aktivnih skautskih zadataka.','genericMessage':'Vaš skaut pripremio je pregled regrutiranja i skautinga.'},
  'sponsorOffersReady':{'title':'Ponude sponzora spremne za sezonu {{season}}','message':'Nove ponude sponzora dostupne su vašem timu. Odaberite sponzore za trenutačnu sezonu.'}
},
'es': {
  'teamUpdateTitle':'Actualización del equipo','teamUpdateMessage':'Abre Notificaciones para ver todos los detalles de esta actualización del equipo.',
  'sponsorKinds':{'main':'principal','secondary':'secundario','technical':'técnico'},
  'sponsorSigned':{'title':'{{name}} fichado como patrocinador {{kind}}','seasonMessage':'{{name}} es ahora tu patrocinador {{kind}} para la temporada {{season}}.','guaranteedMessage':'{{name}} es ahora tu patrocinador {{kind}} para la temporada {{season}}. Pago garantizado: {{amount}}.','technicalMessage':'{{name}} es ahora tu patrocinador {{kind}} para la temporada {{season}}. Pago inmediato: {{cash}}. Fondo de apoyo para equipamiento: {{fund}}.','genericMessage':'{{name}} es ahora tu patrocinador {{kind}}.'},
  'scoutAdvisory':{'title':'Asesoramiento de scouting — revisión de reclutamiento y scouting','message':'Revisión de reclutamiento: {{reports}} informes de scouting completados, {{recent}} completados en los últimos siete días reales, {{highElite}} informes de potencial alto o élite y {{active}} asignaciones de scouting activas.','genericMessage':'Tu scout ha preparado una revisión de reclutamiento y scouting.'},
  'sponsorOffersReady':{'title':'Ofertas de patrocinadores listas para la temporada {{season}}','message':'Hay nuevas ofertas de patrocinadores disponibles para tu equipo. Elige tus patrocinadores para la temporada actual.'}
},
'it': {
  'teamUpdateTitle':'Aggiornamento della squadra','teamUpdateMessage':'Apri le Notifiche per vedere tutti i dettagli di questo aggiornamento della squadra.',
  'sponsorKinds':{'main':'principale','secondary':'secondario','technical':'tecnico'},
  'sponsorSigned':{'title':'{{name}} ingaggiato come sponsor {{kind}}','seasonMessage':'{{name}} è ora il tuo sponsor {{kind}} per la stagione {{season}}.','guaranteedMessage':'{{name}} è ora il tuo sponsor {{kind}} per la stagione {{season}}. Pagamento garantito: {{amount}}.','technicalMessage':'{{name}} è ora il tuo sponsor {{kind}} per la stagione {{season}}. Pagamento immediato: {{cash}}. Fondo di supporto per l’attrezzatura: {{fund}}.','genericMessage':'{{name}} è ora il tuo sponsor {{kind}}.'},
  'scoutAdvisory':{'title':'Consulenza scouting — revisione reclutamento e scouting','message':'Revisione reclutamento: {{reports}} rapporti di scouting completati, {{recent}} completati negli ultimi sette giorni reali, {{highElite}} rapporti con potenziale alto o élite e {{active}} incarichi di scouting attivi.','genericMessage':'Il tuo scout ha preparato una revisione di reclutamento e scouting.'},
  'sponsorOffersReady':{'title':'Offerte sponsor pronte per la stagione {{season}}','message':'Sono disponibili nuove offerte sponsor per la tua squadra. Scegli gli sponsor per la stagione in corso.'}
},
'fr': {
  'teamUpdateTitle':'Mise à jour de l’équipe','teamUpdateMessage':'Ouvrez les Notifications pour consulter tous les détails de cette mise à jour de l’équipe.',
  'sponsorKinds':{'main':'principal','secondary':'secondaire','technical':'technique'},
  'sponsorSigned':{'title':'{{name}} engagé comme sponsor {{kind}}','seasonMessage':'{{name}} est désormais votre sponsor {{kind}} pour la saison {{season}}.','guaranteedMessage':'{{name}} est désormais votre sponsor {{kind}} pour la saison {{season}}. Paiement garanti : {{amount}}.','technicalMessage':'{{name}} est désormais votre sponsor {{kind}} pour la saison {{season}}. Paiement immédiat : {{cash}}. Fonds de soutien pour l’équipement : {{fund}}.','genericMessage':'{{name}} est désormais votre sponsor {{kind}}.'},
  'scoutAdvisory':{'title':'Conseil du scout — bilan recrutement et scouting','message':'Bilan du recrutement : {{reports}} rapports de scouting terminés, {{recent}} terminés au cours des sept derniers jours réels, {{highElite}} rapports avec un potentiel élevé ou élite et {{active}} missions de scouting actives.','genericMessage':'Votre scout a préparé un bilan de recrutement et de scouting.'},
  'sponsorOffersReady':{'title':'Offres de sponsors prêtes pour la saison {{season}}','message':'De nouvelles offres de sponsors sont disponibles pour votre équipe. Choisissez vos sponsors pour la saison en cours.'}
},
'ru': {
  'teamUpdateTitle':'Обновление команды','teamUpdateMessage':'Откройте уведомления, чтобы посмотреть все подробности этого обновления команды.',
  'sponsorKinds':{'main':'главный','secondary':'вторичный','technical':'технический'},
  'sponsorSigned':{'title':'{{name}} подписан как {{kind}} спонсор','seasonMessage':'{{name}} теперь ваш {{kind}} спонсор на сезон {{season}}.','guaranteedMessage':'{{name}} теперь ваш {{kind}} спонсор на сезон {{season}}. Гарантированная выплата: {{amount}}.','technicalMessage':'{{name}} теперь ваш {{kind}} спонсор на сезон {{season}}. Выплачено сразу: {{cash}}. Фонд поддержки оборудования: {{fund}}.','genericMessage':'{{name}} теперь ваш {{kind}} спонсор.'},
  'scoutAdvisory':{'title':'Совет скаута — обзор подбора и скаутинга','message':'Обзор подбора: завершено отчётов скаутинга — {{reports}}, из них {{recent}} за последние семь реальных дней; отчётов с высоким или элитным потенциалом — {{highElite}}; активных заданий скаутинга — {{active}}.','genericMessage':'Ваш скаут подготовил обзор подбора и скаутинга.'},
  'sponsorOffersReady':{'title':'Предложения спонсоров готовы к сезону {{season}}','message':'Для вашей команды доступны новые предложения спонсоров. Выберите спонсоров на текущий сезон.'}
},
}

for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data.setdefault('templateWords', {}).update(WORDS[locale])
    data.setdefault('templateLocalization', {})['feed'] = FEED[locale]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

loc_path = ROOT / 'src/features/notifications/notificationLocalization.ts'
loc = loc_path.read_text(encoding='utf-8')

feed_function = r'''
export function localizeNotificationFeedCopy(
  title: string | null | undefined,
  message: string | null | undefined,
  options?: { genericFallback?: boolean }
): { title: string; message: string } {
  const cleanTitle = String(title ?? '').trim()
  const cleanMessage = String(message ?? '').trim()

  if (!shouldLocalizeNotifications()) {
    return { title: cleanTitle, message: cleanMessage }
  }

  const staffHiredMatch = /^Staff hired:\s*(.+)$/i.exec(cleanTitle)
  if (staffHiredMatch) {
    const name = staffHiredMatch[1].trim()
    const roleMatch = /has joined your club as\s+(.+?)(?:\.|$)/i.exec(cleanMessage)
    const rawRole = roleMatch?.[1]?.trim() || null
    const role = localizeRole(rawRole) || rawRole || nt('roles.staffAdvisor')
    return {
      title: nt('templateLocalization.staffHired.title', { name }),
      message: nt('templateLocalization.staffHired.message', { name, role }),
    }
  }

  const sponsorOffersMatch = /^Sponsor offers ready for season\s+(\d+)$/i.exec(cleanTitle)
  if (sponsorOffersMatch) {
    return {
      title: nt('templateLocalization.feed.sponsorOffersReady.title', { season: sponsorOffersMatch[1] }),
      message: nt('templateLocalization.feed.sponsorOffersReady.message'),
    }
  }

  const sponsorSignedMatch = /^(.+?)\s+signed as\s+(main|secondary|technical)\s+sponsor$/i.exec(cleanTitle)
  if (sponsorSignedMatch) {
    const name = sponsorSignedMatch[1].trim()
    const kindCode = sponsorSignedMatch[2].toLowerCase()
    const kind = nt(`templateLocalization.feed.sponsorKinds.${kindCode}`)
    const season = /for season\s+(\d+)/i.exec(cleanMessage)?.[1]
    const guaranteed = /Guaranteed payment:\s*([^\.]+)\.?/i.exec(cleanMessage)?.[1]?.trim()
    const cash = /Cash paid now:\s*([^\.]+)\.?/i.exec(cleanMessage)?.[1]?.trim()
    const fund = /Equipment support fund:\s*([^\.]+)\.?/i.exec(cleanMessage)?.[1]?.trim()

    let localizedMessage = nt('templateLocalization.feed.sponsorSigned.genericMessage', { name, kind })
    if (season && guaranteed) {
      localizedMessage = nt('templateLocalization.feed.sponsorSigned.guaranteedMessage', {
        name, kind, season, amount: guaranteed,
      })
    } else if (season && cash && fund) {
      localizedMessage = nt('templateLocalization.feed.sponsorSigned.technicalMessage', {
        name, kind, season, cash, fund,
      })
    } else if (season) {
      localizedMessage = nt('templateLocalization.feed.sponsorSigned.seasonMessage', { name, kind, season })
    }

    return {
      title: nt('templateLocalization.feed.sponsorSigned.title', { name, kind }),
      message: localizedMessage,
    }
  }

  if (/^Scout Advisory\s*[—-]\s*Recruitment\s*&\s*Scouting Review$/i.test(cleanTitle) || /^Recruitment review:/i.test(cleanMessage)) {
    const stats = /Recruitment review:\s*(\d+) completed scouting reports,\s*(\d+) completed in the last seven real-life days,\s*(\d+) High or Elite potential reports, and\s*(\d+) active scouting assignments\.?/i.exec(cleanMessage)
    return {
      title: nt('templateLocalization.feed.scoutAdvisory.title'),
      message: stats
        ? nt('templateLocalization.feed.scoutAdvisory.message', {
            reports: stats[1], recent: stats[2], highElite: stats[3], active: stats[4],
          })
        : nt('templateLocalization.feed.scoutAdvisory.genericMessage'),
    }
  }

  if (options?.genericFallback !== false && (looksEnglish(cleanTitle) || looksEnglish(cleanMessage))) {
    return {
      title: looksEnglish(cleanTitle) ? nt('templateLocalization.feed.teamUpdateTitle') : cleanTitle,
      message: looksEnglish(cleanMessage) ? nt('templateLocalization.feed.teamUpdateMessage') : cleanMessage,
    }
  }

  return { title: cleanTitle, message: cleanMessage }
}

'''

if 'export function localizeNotificationFeedCopy(' not in loc:
    marker = 'export function localizeNotificationItem(item: NotificationItem): NotificationItem {'
    loc = loc.replace(marker, feed_function + marker)

needle = "  const entity = getPrimaryEntity(item)\n\n"
inject = "  const entity = getPrimaryEntity(item)\n\n  const feedCopy = localizeNotificationFeedCopy(item.title, item.message, { genericFallback: false })\n  if (feedCopy.title !== String(item.title ?? '').trim() || feedCopy.message !== String(item.message ?? '').trim()) {\n    return { ...item, title: feedCopy.title, message: feedCopy.message }\n  }\n\n"
if 'const feedCopy = localizeNotificationFeedCopy' not in loc:
    if needle not in loc:
        raise SystemExit('Could not find notificationLocalization insertion point')
    loc = loc.replace(needle, inject, 1)
loc_path.write_text(loc, encoding='utf-8')

overview_path = ROOT / 'src/pages/dashboard/Overview.tsx'
overview = overview_path.read_text(encoding='utf-8')
import_line = 'import { localizeNotificationFeedCopy } from "../../features/notifications/notificationLocalization";\n'
if import_line not in overview:
    marker = 'import { supabase } from "../../lib/supabase";\n'
    if marker not in overview:
        raise SystemExit('Could not find Overview import point')
    overview = overview.replace(marker, marker + import_line, 1)

copy_marker = '  const cleanSubtitle = (subtitle ?? "").trim();\n\n'
copy_inject = '  const cleanSubtitle = (subtitle ?? "").trim();\n\n  const sharedCopy = localizeNotificationFeedCopy(cleanTitle, cleanSubtitle);\n  if (sharedCopy.title !== cleanTitle || sharedCopy.message !== cleanSubtitle) {\n    return { title: sharedCopy.title, subtitle: sharedCopy.message };\n  }\n\n'
if 'const sharedCopy = localizeNotificationFeedCopy(cleanTitle, cleanSubtitle);' not in overview:
    if copy_marker not in overview:
        raise SystemExit('Could not find Overview news localization insertion point')
    overview = overview.replace(copy_marker, copy_inject, 1)
overview_path.write_text(overview, encoding='utf-8')

print('Updated notification localization for all supported languages and wired the Overview News Board to the shared translator.')
