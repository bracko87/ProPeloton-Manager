from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('.')
LOCALES = ['sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']

TITLES_TSV = r'''RACE_PLAN_NEEDS_ATTENTION|Plan trke zahteva pažnju|Rennplan erfordert Aufmerksamkeit|Plan utrke zahtijeva pažnju|El plan de carrera requiere atención|Il piano di gara richiede attenzione|Le plan de course nécessite votre attention|План гонки требует внимания
RACE_JERSEYS_MANDATORY_WARNING|Nedostaju obavezni trkački dresovi|Pflicht-Renntrikots fehlen|Nedostaju obavezni dresovi za utrku|Faltan los maillots obligatorios de carrera|Mancano le maglie da gara obbligatorie|Des maillots de course obligatoires manquent|Не хватает обязательных гоночных комплектов
RIDER_UNHAPPY|Vozač je nezadovoljan|Fahrer ist unzufrieden|Vozač je nezadovoljan|Un corredor está descontento|Un corridore è scontento|Un coureur est mécontent|Гонщик недоволен
RIDER_CONTRACT_EXPIRING|Ugovor vozača uskoro ističe|Fahrervertrag läuft bald aus|Ugovor vozača uskoro istječe|El contrato de un corredor vence pronto|Il contratto di un corridore sta per scadere|Le contrat d’un coureur arrive bientôt à expiration|Контракт гонщика скоро истекает
RACE_WEATHER_CANCELLED|Trka je otkazana zbog vremena|Rennen wegen des Wetters abgesagt|Utrka je otkazana zbog vremenskih uvjeta|Carrera cancelada por el tiempo|Gara annullata per il maltempo|Course annulée en raison de la météo|Гонка отменена из-за погоды
RACE_STAGE_WEATHER_CANCELLED|Etapa je otkazana zbog vremena|Etappe wegen des Wetters abgesagt|Etapa je otkazana zbog vremenskih uvjeta|Etapa cancelada por el tiempo|Tappa annullata per il maltempo|Étape annulée en raison de la météo|Этап отменён из-за погоды
RACE_RESULTS_SUMMARY|Rezultati trke su dostupni|Rennergebnisse sind verfügbar|Rezultati utrke su dostupni|Los resultados de la carrera están disponibles|I risultati della gara sono disponibili|Les résultats de la course sont disponibles|Результаты гонки доступны
SPONSOR_SELECTION_REQUIRED|Potrebno je izabrati sponzore|Sponsoren müssen ausgewählt werden|Potrebno je odabrati sponzore|Debes seleccionar patrocinadores|È necessario scegliere gli sponsor|Vous devez sélectionner vos sponsors|Необходимо выбрать спонсоров
INFRASTRUCTURE_UPGRADE_COMPLETED|Nadogradnja objekta je završena|Infrastrukturausbau abgeschlossen|Nadogradnja objekta je završena|Mejora de infraestructura completada|Potenziamento dell’infrastruttura completato|Amélioration de l’infrastructure terminée|Улучшение инфраструктуры завершено
INFRASTRUCTURE_ASSET_DELIVERED|Infrastrukturna oprema je isporučena|Infrastrukturobjekt wurde geliefert|Infrastrukturna oprema je isporučena|Activo de infraestructura entregado|Bene infrastrutturale consegnato|Équipement d’infrastructure livré|Объект инфраструктуры доставлен
TRANSFER_OFFER_RECEIVED|Primljena je transfer ponuda|Transferangebot erhalten|Primljena je ponuda za transfer|Oferta de traspaso recibida|Offerta di trasferimento ricevuta|Offre de transfert reçue|Получено трансферное предложение
RIDER_NEGOTIATION_OPENED|Pregovori sa vozačem su otvoreni|Verhandlung mit dem Fahrer läuft|Pregovori s vozačem su otvoreni|Negociación con el corredor abierta|Trattativa con il corridore aperta|Négociation avec le coureur ouverte|Переговоры с гонщиком начались
RIDER_NEGOTIATION_DECLINED|Vozač je odbio pregovore|Fahrer hat die Verhandlung abgelehnt|Vozač je odbio pregovore|El corredor rechazó la negociación|Il corridore ha rifiutato la trattativa|Le coureur a refusé la négociation|Гонщик отклонил условия переговоров
RIDER_NEGOTIATION_COUNTERED|Vozač je poslao kontraponudu|Fahrer hat ein Gegenangebot gemacht|Vozač je poslao protuponudu|El corredor ha hecho una contraoferta|Il corridore ha fatto una controproposta|Le coureur a fait une contre-proposition|Гонщик сделал встречное предложение
TRANSFER_OFFER_REJECTED|Transfer ponuda je odbijena|Transferangebot abgelehnt|Ponuda za transfer je odbijena|Oferta de traspaso rechazada|Offerta di trasferimento rifiutata|Offre de transfert refusée|Трансферное предложение отклонено
TRANSFER_OFFER_EXPIRED|Transfer ponuda je istekla|Transferangebot abgelaufen|Ponuda za transfer je istekla|Oferta de traspaso caducada|Offerta di trasferimento scaduta|Offre de transfert expirée|Срок трансферного предложения истёк
TRANSFER_OFFER_ACCEPTED|Transfer ponuda je prihvaćena|Transferangebot angenommen|Ponuda za transfer je prihvaćena|Oferta de traspaso aceptada|Offerta di trasferimento accettata|Offre de transfert acceptée|Трансферное предложение принято
TRANSFER_COMPLETED|Transfer je završen|Transfer abgeschlossen|Transfer je dovršen|Traspaso completado|Trasferimento completato|Transfert finalisé|Трансфер завершён
STAFF_HIRED|Novi član osoblja je angažovan|Neues Personal eingestellt|Novi član osoblja je zaposlen|Nuevo miembro del personal contratado|Nuovo membro dello staff ingaggiato|Nouveau membre du personnel recruté|Новый сотрудник принят на работу
STAFF_CONTRACT_EXPIRING|Ugovor člana osoblja uskoro ističe|Personalvertrag läuft bald aus|Ugovor člana osoblja uskoro istječe|El contrato de un miembro del personal vence pronto|Il contratto di un membro dello staff sta per scadere|Le contrat d’un membre du personnel arrive bientôt à expiration|Контракт сотрудника скоро истекает
STAFF_COURSE_COMPLETED|Član osoblja je završio kurs|Personalkurs abgeschlossen|Član osoblja je završio tečaj|Curso del personal completado|Corso dello staff completato|Formation du personnel terminée|Сотрудник завершил курс
RETIREMENT_ANNOUNCED|Najavljen je odlazak u penziju|Ruhestand angekündigt|Najavljen je odlazak u mirovinu|Retirada anunciada|Ritiro annunciato|Départ à la retraite annoncé|Объявлено о завершении карьеры
SEASON_RETIREMENTS_CONFIRMED|Potvrđeni su odlasci u penziju na kraju sezone|Ruhestände zum Saisonende bestätigt|Potvrđeni su odlasci u mirovinu na kraju sezone|Retiros de la temporada confirmados|Ritiri di fine stagione confermati|Départs à la retraite de la saison confirmés|Завершения карьеры в сезоне подтверждены
TAX_AUDIT_COMPLETED|Poreska kontrola je završena|Steuerprüfung abgeschlossen|Porezna kontrola je završena|Auditoría fiscal completada|Verifica fiscale completata|Contrôle fiscal terminé|Налоговая проверка завершена
SCOUT_REPORT_COMPLETED|Skautski izveštaj je završen|Scoutingbericht abgeschlossen|Skautski izvještaj je dovršen|Informe de ojeador completado|Rapporto scouting completato|Rapport de recrutement terminé|Отчёт скаута готов
TRAINING_CAMP_START|Trening kamp je počeo|Trainingslager hat begonnen|Trening kamp je započeo|El campo de entrenamiento ha comenzado|Il ritiro di allenamento è iniziato|Le stage d’entraînement a commencé|Тренировочный сбор начался
TRAINING_CAMP_DAILY_REPORT|Dnevni izveštaj sa trening kampa|Tagesbericht aus dem Trainingslager|Dnevni izvještaj s trening kampa|Informe diario del campo de entrenamiento|Rapporto giornaliero del ritiro|Rapport quotidien du stage d’entraînement|Ежедневный отчёт с тренировочного сбора
TRAINING_CAMP_FINISHED|Trening kamp je završen|Trainingslager beendet|Trening kamp je završen|El campo de entrenamiento ha terminado|Il ritiro di allenamento è terminato|Le stage d’entraînement est terminé|Тренировочный сбор завершён
RIDER_SICK|Vozač je bolestan|Fahrer ist krank|Vozač je bolestan|Un corredor está enfermo|Un corridore è malato|Un coureur est malade|Гонщик заболел
RIDER_NOT_FULLY_FIT|Vozač nije potpuno spreman|Fahrer ist noch nicht vollständig fit|Vozač nije potpuno spreman|Un corredor aún no está completamente en forma|Un corridore non è ancora pienamente in forma|Un coureur n’est pas encore totalement apte|Гонщик ещё не полностью готов
RIDER_INJURED|Vozač je povređen|Fahrer verletzt|Vozač je ozlijeđen|Corredor lesionado|Corridore infortunato|Coureur blessé|Гонщик травмирован
RIDER_FIT_AGAIN|Vozač je ponovo spreman|Fahrer ist wieder fit|Vozač je ponovno spreman|El corredor vuelve a estar en forma|Il corridore è di nuovo in forma|Le coureur est de nouveau apte|Гонщик снова готов
BIRTHDAY_GIFT_10_COINS|Srećan rođendan, ProPeloton!|Alles Gute zum Geburtstag, ProPeloton!|Sretan rođendan, ProPeloton!|¡Feliz cumpleaños, ProPeloton!|Buon compleanno, ProPeloton!|Joyeux anniversaire, ProPeloton !|С днём рождения, ProPeloton!
WELCOME_MESSAGE|Dobro došli|Willkommen|Dobro došli|Bienvenido|Benvenuto|Bienvenue|Добро пожаловать
ADMIN_MESSAGE|Poruka administracije|Nachricht der Administration|Poruka administracije|Mensaje de la administración|Messaggio dell’amministrazione|Message de l’administration|Сообщение администрации
COIN_PURCHASE_COMPLETED|Kupovina novčića je završena|Coin-Kauf abgeschlossen|Kupnja novčića je dovršena|Compra de monedas completada|Acquisto di monete completato|Achat de pièces terminé|Покупка монет завершена
REFERRAL_REWARD_GRANTED|Nagrada za preporuku je dodeljena|Empfehlungsprämie gutgeschrieben|Nagrada za preporuku je dodijeljena|Recompensa por recomendación concedida|Ricompensa per invito assegnata|Récompense de parrainage accordée|Награда за приглашение начислена
SPONSOR_DEAL_EXPIRED|Sponzorski ugovor je istekao|Sponsorenvertrag abgelaufen|Sponzorski ugovor je istekao|Contrato de patrocinio caducado|Accordo di sponsorizzazione scaduto|Contrat de sponsoring expiré|Спонсорский контракт истёк
FREE_AGENT_EXPIRED|Istekla je prilika za slobodnog vozača|Chance auf freien Fahrer abgelaufen|Istekla je prilika za slobodnog vozača|Oportunidad de agente libre caducada|Opportunità per un corridore svincolato scaduta|Opportunité de coureur libre expirée|Срок возможности подписать свободного гонщика истёк
FINANCE_EMERGENCY_LOAN_GRANTED|Odobren je hitni kredit|Notkredit gewährt|Odobren je hitni kredit|Préstamo de emergencia concedido|Prestito d’emergenza concesso|Prêt d’urgence accordé|Экстренный кредит предоставлен
FINANCE_EMERGENCY_LOAN_REPAID|Hitni kredit je otplaćen|Notkredit zurückgezahlt|Hitni kredit je otplaćen|Préstamo de emergencia reembolsado|Prestito d’emergenza rimborsato|Prêt d’urgence remboursé|Экстренный кредит погашен
FINANCE_LIQUIDATION_FINAL_WARNING|Poslednje upozorenje pred likvidaciju|Letzte Warnung vor der Liquidation|Posljednje upozorenje pred likvidaciju|Último aviso antes de la liquidación|Ultimo avviso prima della liquidazione|Dernier avertissement avant liquidation|Последнее предупреждение перед ликвидацией
FINANCE_CLUB_LIQUIDATED|Klub je likvidiran|Club liquidiert|Klub je likvidiran|Club liquidado|Club liquidato|Club liquidé|Клуб ликвидирован
INFRASTRUCTURE_ASSET_CONDITION_LOW|Stanje infrastrukturne opreme je loše|Zustand eines Infrastrukturobjekts ist niedrig|Stanje infrastrukturne opreme je loše|Un activo de infraestructura está en mal estado|Un bene infrastrutturale è in cattive condizioni|Un équipement d’infrastructure est en mauvais état|Состояние объекта инфраструктуры ухудшилось
INFRASTRUCTURE_ASSET_REPAIR_STARTED|Popravka infrastrukturne opreme je počela|Reparatur eines Infrastrukturobjekts gestartet|Popravak infrastrukturne opreme je započeo|Reparación de un activo de infraestructura iniciada|Riparazione di un bene infrastrutturale avviata|Réparation d’un équipement d’infrastructure commencée|Ремонт объекта инфраструктуры начался
RIDER_TRANSFER_LISTING_EXPIRED|Oglas vozača za transfer je istekao|Transferlisteneintrag eines Fahrers abgelaufen|Oglas vozača za transfer je istekao|Anuncio de traspaso del corredor caducado|Inserzione di trasferimento del corridore scaduta|Mise sur la liste des transferts expirée|Срок выставления гонщика на трансфер истёк
RIDER_RELEASED_TO_FREE_AGENTS|Vozač je prešao među slobodne vozače|Fahrer als vereinslos freigegeben|Vozač je prešao među slobodne vozače|Corredor liberado al mercado de agentes libres|Corridore svincolato e inserito tra i free agent|Coureur libéré sur le marché des agents libres|Гонщик переведён в свободные агенты
DEVELOPING_TEAM_WINDOW_OPEN|Otvoren je period za promene u razvojnom timu|Wechselfenster des Entwicklungsteams geöffnet|Otvoren je period za promjene u razvojnom timu|Ventana de movimientos del equipo de desarrollo abierta|Finestra movimenti della squadra di sviluppo aperta|Fenêtre de mouvements de l’équipe de développement ouverte|Окно переходов развивающей команды открыто
DEVELOPING_RIDER_AGE_LIMIT_REACHED|Vozač razvojnog tima dostigao je starosnu granicu|Fahrer im Entwicklungsteam hat die Altersgrenze erreicht|Vozač razvojnog tima dosegnuo je dobnu granicu|Un corredor del equipo de desarrollo alcanzó el límite de edad|Un corridore della squadra di sviluppo ha raggiunto il limite d’età|Un coureur de l’équipe de développement a atteint la limite d’âge|Гонщик развивающей команды достиг возрастного лимита
INFRASTRUCTURE_ASSET_REPAIRED|Infrastrukturna oprema je popravljena|Infrastrukturobjekt repariert|Infrastrukturna oprema je popravljena|Activo de infraestructura reparado|Bene infrastrutturale riparato|Équipement d’infrastructure réparé|Объект инфраструктуры отремонтирован
STAGE_PLANS_OPEN|Planovi etapa su otvoreni|Etappenpläne sind geöffnet|Planovi etapa su otvoreni|Los planes de etapa están abiertos|I piani di tappa sono aperti|Les plans d’étape sont ouverts|Планы на этапы открыты
STAGE_PLAN_LOCK_REMINDER|Planovi za etapu se uskoro zaključavaju|Etappenpläne werden bald gesperrt|Planovi za etapu uskoro se zaključavaju|Los planes de etapa se bloquearán pronto|I piani di tappa verranno bloccati a breve|Les plans d’étape seront bientôt verrouillés|Планы на этап скоро будут заблокированы
RACE_APPLICATION_ACCEPTED|Prijava za trku je prihvaćena|Rennanmeldung angenommen|Prijava za utrku je prihvaćena|Inscripción a la carrera aceptada|Iscrizione alla gara accettata|Inscription à la course acceptée|Заявка на гонку принята
RACE_APPLICATION_DECLINED|Prijava za trku je odbijena|Rennanmeldung abgelehnt|Prijava za utrku je odbijena|Inscripción a la carrera rechazada|Iscrizione alla gara rifiutata|Inscription à la course refusée|Заявка на гонку отклонена
RACE_PLAN_DEADLINE_REMINDER|Rok za plan trke se približava|Frist für den Rennplan rückt näher|Rok za plan utrke se približava|Se acerca el plazo del plan de carrera|Si avvicina la scadenza del piano di gara|L’échéance du plan de course approche|Приближается срок подачи плана гонки
RACE_PLAN_OPEN|Plan trke je otvoren|Rennplan ist geöffnet|Plan utrke je otvoren|El plan de carrera está abierto|Il piano di gara è aperto|Le plan de course est ouvert|План гонки открыт
STAGE_PLAN_LOCKED|Planovi za etapu su zaključani|Etappenpläne sind gesperrt|Planovi za etapu su zaključani|Los planes de etapa están bloqueados|I piani di tappa sono bloccati|Les plans d’étape sont verrouillés|Планы на этап заблокированы
RIDER_WANTS_MORE_RACE_SELECTION|Vozač želi više prilika za trke|Fahrer möchte häufiger für Rennen nominiert werden|Vozač želi više prilika za utrke|Un corredor quiere más oportunidades de competir|Un corridore vuole più opportunità di gara|Un coureur souhaite participer à davantage de courses|Гонщик хочет чаще участвовать в гонках
RIDER_REQUESTS_RELEASE|Vozač traži odlazak iz tima|Fahrer bittet um Freigabe|Vozač traži odlazak iz tima|Un corredor pide salir del equipo|Un corridore chiede di lasciare la squadra|Un coureur demande à quitter l’équipe|Гонщик просит отпустить его из команды
COINS_LOW_WARNING|Stanje novčića je nisko|Coin-Guthaben wird knapp|Stanje novčića je nisko|Quedan pocas monedas|Le monete stanno per esaurirsi|Votre solde de pièces est faible|Монеты заканчиваются
RACE_SUPPLIES_LOW_STOCK|Zalihe su pri kraju|Vorräte werden knapp|Zalihe su pri kraju|Las existencias se están agotando|Le scorte stanno per esaurirsi|Les stocks sont presque épuisés|Запасы заканчиваются
RACE_SUPPLIES_LOW|Niske zalihe|Niedrige Vorräte|Niske zalihe|Existencias bajas|Scorte basse|Stocks faibles|Низкий уровень запасов
STAGE_PLAN_MISSING_AT_LOCK|Nedostaje plan etape pri zaključavanju|Etappenplan fehlte beim Sperren|Nedostaje plan etape pri zaključavanju|Faltaba un plan de etapa al bloquearse|Mancava un piano di tappa al momento del blocco|Un plan d’étape manquait au verrouillage|При блокировке отсутствовал план этапа
MAIN_SPONSOR_OBJECTIVE_ACHIEVED|Cilj glavnog sponzora je ostvaren|Ziel des Hauptsponsors erreicht|Cilj glavnog sponzora je ostvaren|Objetivo del patrocinador principal cumplido|Obiettivo dello sponsor principale raggiunto|Objectif du sponsor principal atteint|Цель главного спонсора достигнута
MAIN_SPONSOR_OBJECTIVE_FAILED|Cilj glavnog sponzora nije ostvaren|Ziel des Hauptsponsors verfehlt|Cilj glavnog sponzora nije ostvaren|Objetivo del patrocinador principal no cumplido|Obiettivo dello sponsor principale non raggiunto|Objectif du sponsor principal manqué|Цель главного спонсора не выполнена
STAFF_CONTRACT_EXPIRED|Ugovor člana osoblja je istekao|Personalvertrag abgelaufen|Ugovor člana osoblja je istekao|Contrato de un miembro del personal caducado|Contratto di un membro dello staff scaduto|Contrat d’un membre du personnel expiré|Контракт сотрудника истёк
RIDER_CONTRACT_EXPIRED|Ugovor vozača je istekao|Fahrervertrag abgelaufen|Ugovor vozača je istekao|Contrato de un corredor caducado|Contratto di un corridore scaduto|Contrat d’un coureur expiré|Контракт гонщика истёк
NEW_SEASON_STARTED|Nova sezona je počela|Neue Saison hat begonnen|Nova sezona je počela|Ha comenzado una nueva temporada|È iniziata una nuova stagione|Une nouvelle saison a commencé|Начался новый сезон
COMPETITION_REWARD_GRANTED|Dodeljena je nagrada za takmičenje|Wettbewerbsprämie gutgeschrieben|Dodijeljena je nagrada za natjecanje|Recompensa de competición concedida|Ricompensa della competizione assegnata|Récompense de compétition accordée|Награда за соревнование начислена'''

ENTITY_TITLES_TSV = r'''RACE_PLAN_NEEDS_ATTENTION|Plan trke zahteva pažnju: {{entity}}|Rennplan erfordert Aufmerksamkeit: {{entity}}|Plan utrke zahtijeva pažnju: {{entity}}|El plan de carrera requiere atención: {{entity}}|Il piano di gara richiede attenzione: {{entity}}|Le plan de course nécessite votre attention : {{entity}}|План гонки требует внимания: {{entity}}
RACE_RESULTS_SUMMARY|Rezultati trke su dostupni: {{entity}}|Rennergebnisse sind verfügbar: {{entity}}|Rezultati utrke su dostupni: {{entity}}|Los resultados de la carrera están disponibles: {{entity}}|I risultati della gara sono disponibili: {{entity}}|Les résultats de la course sont disponibles : {{entity}}|Результаты гонки доступны: {{entity}}
STAGE_PLANS_OPEN|Planovi etapa su otvoreni: {{entity}}|Etappenpläne sind geöffnet: {{entity}}|Planovi etapa su otvoreni: {{entity}}|Los planes de etapa están abiertos: {{entity}}|I piani di tappa sono aperti: {{entity}}|Les plans d’étape sont ouverts : {{entity}}|Планы на этапы открыты: {{entity}}
STAGE_PLAN_LOCK_REMINDER|Planovi za etapu se uskoro zaključavaju: {{entity}}|Etappenpläne werden bald gesperrt: {{entity}}|Planovi za etapu uskoro se zaključavaju: {{entity}}|Los planes de etapa se bloquearán pronto: {{entity}}|I piani di tappa verranno bloccati a breve: {{entity}}|Les plans d’étape seront bientôt verrouillés : {{entity}}|Планы на этап скоро будут заблокированы: {{entity}}
RACE_APPLICATION_ACCEPTED|Prijava za trku je prihvaćena: {{entity}}|Rennanmeldung angenommen: {{entity}}|Prijava za utrku je prihvaćena: {{entity}}|Inscripción a la carrera aceptada: {{entity}}|Iscrizione alla gara accettata: {{entity}}|Inscription à la course acceptée : {{entity}}|Заявка на гонку принята: {{entity}}
RACE_APPLICATION_DECLINED|Prijava za trku je odbijena: {{entity}}|Rennanmeldung abgelehnt: {{entity}}|Prijava za utrku je odbijena: {{entity}}|Inscripción a la carrera rechazada: {{entity}}|Iscrizione alla gara rifiutata: {{entity}}|Inscription à la course refusée : {{entity}}|Заявка на гонку отклонена: {{entity}}
RACE_PLAN_DEADLINE_REMINDER|Rok za plan trke se približava: {{entity}}|Frist für den Rennplan rückt näher: {{entity}}|Rok za plan utrke se približava: {{entity}}|Se acerca el plazo del plan de carrera: {{entity}}|Si avvicina la scadenza del piano di gara: {{entity}}|L’échéance du plan de course approche : {{entity}}|Приближается срок подачи плана гонки: {{entity}}
RACE_PLAN_OPEN|Plan trke je otvoren: {{entity}}|Rennplan ist geöffnet: {{entity}}|Plan utrke je otvoren: {{entity}}|El plan de carrera está abierto: {{entity}}|Il piano di gara è aperto: {{entity}}|Le plan de course est ouvert : {{entity}}|План гонки открыт: {{entity}}
STAGE_PLAN_LOCKED|Planovi za etapu su zaključani: {{entity}}|Etappenpläne sind gesperrt: {{entity}}|Planovi za etapu su zaključani: {{entity}}|Los planes de etapa están bloqueados: {{entity}}|I piani di tappa sono bloccati: {{entity}}|Les plans d’étape sont verrouillés : {{entity}}|Планы на этап заблокированы: {{entity}}
STAGE_PLAN_MISSING_AT_LOCK|Nedostaje plan etape pri zaključavanju: {{entity}}|Etappenplan fehlte beim Sperren: {{entity}}|Nedostaje plan etape pri zaključavanju: {{entity}}|Faltaba un plan de etapa al bloquearse: {{entity}}|Mancava un piano di tappa al momento del blocco: {{entity}}|Un plan d’étape manquait au verrouillage : {{entity}}|При блокировке отсутствовал план этапа: {{entity}}'''

MESSAGES_TSV = r'''STAGE_PLANS_OPEN|Planiranje po etapama za {{entity}} sada je dostupno.|Die Etappenplanung für {{entity}} ist jetzt verfügbar.|Planiranje po etapama za {{entity}} sada je dostupno.|La planificación por etapas para {{entity}} ya está disponible.|La pianificazione tappa per tappa per {{entity}} è ora disponibile.|La planification étape par étape pour {{entity}} est désormais disponible.|Планирование по этапам для {{entity}} теперь доступно.
STAGE_PLAN_LOCK_REMINDER|Planovi etapa za {{entity}} uskoro će se zaključati. Pregledajte i završite taktiku pre zaključavanja.|Die Etappenpläne für {{entity}} werden bald gesperrt. Prüfen und finalisieren Sie Ihre Taktik vor der Sperrfrist.|Planovi etapa za {{entity}} uskoro će se zaključati. Pregledajte i dovršite taktiku prije zaključavanja.|Los planes de etapa para {{entity}} se bloquearán pronto. Revisa y finaliza la táctica antes del cierre.|I piani di tappa per {{entity}} verranno bloccati a breve. Controlla e finalizza la tattica prima della chiusura.|Les plans d’étape pour {{entity}} seront bientôt verrouillés. Vérifiez et finalisez votre tactique avant la fermeture.|Планы этапов для {{entity}} скоро будут заблокированы. Проверьте и завершите тактику до блокировки.
STAGE_PLAN_LOCKED|Planovi etapa za {{entity}} sada su zaključani i više ne mogu da se menjaju.|Die Etappenpläne für {{entity}} sind jetzt gesperrt und können nicht mehr geändert werden.|Planovi etapa za {{entity}} sada su zaključani i više se ne mogu mijenjati.|Los planes de etapa para {{entity}} ya están bloqueados y no se pueden modificar.|I piani di tappa per {{entity}} sono ora bloccati e non possono più essere modificati.|Les plans d’étape pour {{entity}} sont maintenant verrouillés et ne peuvent plus être modifiés.|Планы этапов для {{entity}} теперь заблокированы и больше не могут быть изменены.
STAGE_PLAN_MISSING_AT_LOCK|Za {{entity}} je pri zaključavanju nedostajao plan etape. Otvorite Pripremu trke i proverite detalje.|Für {{entity}} fehlte beim Sperren ein Etappenplan. Öffnen Sie die Rennvorbereitung und prüfen Sie die Details.|Za {{entity}} je pri zaključavanju nedostajao plan etape. Otvorite Pripremu utrke i provjerite detalje.|Faltaba un plan de etapa para {{entity}} cuando se produjo el bloqueo. Abre la preparación de carrera y revisa los detalles.|Al momento del blocco mancava un piano di tappa per {{entity}}. Apri la preparazione gara e controlla i dettagli.|Un plan d’étape manquait pour {{entity}} au moment du verrouillage. Ouvrez la préparation de course et vérifiez les détails.|Для {{entity}} при блокировке отсутствовал план этапа. Откройте подготовку к гонке и проверьте детали.
RACE_PLAN_OPEN|Plan trke za {{entity}} sada je otvoren i možete da pripremite izbor vozača i logistiku.|Der Rennplan für {{entity}} ist jetzt geöffnet. Sie können Fahrerauswahl und Logistik vorbereiten.|Plan utrke za {{entity}} sada je otvoren i možete pripremiti odabir vozača i logistiku.|El plan de carrera para {{entity}} ya está abierto y puedes preparar la selección de corredores y la logística.|Il piano di gara per {{entity}} è ora aperto e puoi preparare la selezione dei corridori e la logistica.|Le plan de course pour {{entity}} est désormais ouvert et vous pouvez préparer la sélection des coureurs et la logistique.|План гонки для {{entity}} теперь открыт: можно подготовить состав и логистику.
RACE_PLAN_DEADLINE_REMINDER|Rok za plan trke {{entity}} se približava. Pregledajte izbor i pošaljite plan na vreme.|Die Frist für den Rennplan von {{entity}} rückt näher. Prüfen Sie Ihre Auswahl und reichen Sie den Plan rechtzeitig ein.|Rok za plan utrke {{entity}} se približava. Pregledajte odabir i pošaljite plan na vrijeme.|Se acerca el plazo del plan de carrera de {{entity}}. Revisa la selección y envía el plan a tiempo.|Si avvicina la scadenza del piano di gara di {{entity}}. Controlla la selezione e invia il piano in tempo.|L’échéance du plan de course de {{entity}} approche. Vérifiez votre sélection et envoyez le plan à temps.|Приближается срок подачи плана гонки {{entity}}. Проверьте состав и отправьте план вовремя.
RACE_PLAN_NEEDS_ATTENTION|Plan trke {{entity}} zahteva vašu pažnju. Pregledajte pripremu i rešite preostale stavke.|Der Rennplan für {{entity}} erfordert Ihre Aufmerksamkeit. Prüfen Sie die Vorbereitung und erledigen Sie offene Punkte.|Plan utrke {{entity}} zahtijeva vašu pažnju. Pregledajte pripremu i riješite preostale stavke.|El plan de carrera de {{entity}} requiere tu atención. Revisa la preparación y resuelve los puntos pendientes.|Il piano di gara di {{entity}} richiede la tua attenzione. Controlla la preparazione e risolvi gli elementi ancora aperti.|Le plan de course de {{entity}} nécessite votre attention. Vérifiez la préparation et réglez les éléments en attente.|План гонки {{entity}} требует вашего внимания. Проверьте подготовку и устраните оставшиеся проблемы.'''

def parse_table(raw: str) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split('|')
        if len(parts) != 8:
            raise SystemExit(f'Invalid semantic notification row ({len(parts)} fields): {line}')
        code, *values = parts
        out[code] = dict(zip(LOCALES, values))
    return out

TITLES = parse_table(TITLES_TSV)
ENTITY_TITLES = parse_table(ENTITY_TITLES_TSV)
MESSAGES = parse_table(MESSAGES_TSV)

for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data['semanticTypeTitles'] = {code: values[locale] for code, values in TITLES.items()}
    data['semanticTypeEntityTitles'] = {code: values[locale] for code, values in ENTITY_TITLES.items()}
    data['semanticTypeMessages'] = {code: values[locale] for code, values in MESSAGES.items()}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

loc_path = ROOT / 'src/features/notifications/notificationLocalization.ts'
text = loc_path.read_text(encoding='utf-8')

anchor = '''function localizeTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode) return null
  if (!shouldLocalizeNotifications()) return typeCode

'''
replacement = '''function localizeSemanticTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode || !shouldLocalizeNotifications()) return null
  const code = String(typeCode).toUpperCase()
  const key = `semanticTypeTitles.${code}`
  const value = nt(key, { defaultValue: '' })
  return value && value !== key ? value : null
}

function localizeSemanticEntityTitle(typeCode: string, entity: string | null): string | null {
  if (!entity || !shouldLocalizeNotifications()) return null
  const key = `semanticTypeEntityTitles.${typeCode}`
  const value = nt(key, { entity, defaultValue: '' })
  return value && value !== key ? value : null
}

function localizeSemanticMessage(typeCode: string, entity: string | null): string | null {
  if (!entity || !shouldLocalizeNotifications()) return null
  const key = `semanticTypeMessages.${typeCode}`
  const value = nt(key, { entity, defaultValue: '' })
  return value && value !== key ? value : null
}

function localizeTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode) return null
  if (!shouldLocalizeNotifications()) return typeCode

  const semantic = localizeSemanticTypeCode(typeCode)
  if (semantic) return semantic

'''
if 'function localizeSemanticTypeCode' not in text:
    if anchor not in text:
        raise SystemExit('localizeTypeCode anchor not found')
    text = text.replace(anchor, replacement, 1)

old = '''  const topic = localizedType || getTopic(item)
  const localizedTitle = item.title && !looksEnglish(item.title)
    ? item.title
    : nt('templateLocalization.genericTitle', { topic })
  const localizedMessage = item.message && !looksEnglish(item.message)
    ? item.message
    : entity
      ? nt('templateLocalization.genericEntityMessage', { topic, entity })
      : nt('templateLocalization.genericMessage', { topic })
'''
new = '''  const semanticType = localizeSemanticTypeCode(typeCode)
  const topic = semanticType || localizedType || getTopic(item)
  const semanticEntityTitle = localizeSemanticEntityTitle(typeCode, entity)
  const semanticMessage = localizeSemanticMessage(typeCode, entity)
  const localizedTitle = item.title && !looksEnglish(item.title)
    ? item.title
    : semanticEntityTitle || semanticType || nt('templateLocalization.genericTitle', { topic })
  const localizedMessage = item.message && !looksEnglish(item.message)
    ? item.message
    : semanticMessage || (entity
      ? nt('templateLocalization.genericEntityMessage', { topic, entity })
      : nt('templateLocalization.genericMessage', { topic }))
'''
if old in text:
    text = text.replace(old, new, 1)
elif 'const semanticEntityTitle = localizeSemanticEntityTitle' not in text:
    raise SystemExit('localizeNotificationItem title/message anchor not found')

loc_path.write_text(text, encoding='utf-8')

# Guard the exact wording the user identified as broken.
if TITLES['STAGE_PLAN_LOCK_REMINDER']['hr'] != 'Planovi za etapu uskoro se zaključavaju':
    raise SystemExit('Croatian stage-plan reminder wording changed unexpectedly')
if TITLES['STAGE_PLAN_LOCK_REMINDER']['sr-Latn'] != 'Planovi za etapu se uskoro zaključavaju':
    raise SystemExit('Serbian stage-plan reminder wording changed unexpectedly')

print(f'Applied semantic notification titles for {len(TITLES)} notification types across {len(LOCALES)} non-English locales')
