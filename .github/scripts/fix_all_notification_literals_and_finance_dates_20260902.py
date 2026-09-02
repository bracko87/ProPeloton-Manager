from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('.')
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']

# These are the static notification detail labels that remained unresolved after
# manual mappings + exact translation reuse across every game namespace +
# reusable-word coverage. Keeping them as exact localized phrases avoids
# exposing English and avoids awkward word-by-word grammar for these labels.
DETAILS = {
'en': {
'Accepted races · next 30 game days':'Accepted races · next 30 game days','Actionable incomplete plans':'Actionable incomplete plans','Actionable missing plans':'Actionable missing plans','Advisory':'Advisory','Affected / unavailable':'Affected / unavailable','Affected stage':'Affected stage','Annual value':'Annual value','Available cash':'Available cash','Best annual value':'Best annual value','Best attribute':'Best attribute','Best team result':'Best team result','Career start':'Career start','Cash fine':'Cash fine','Cash penalty':'Cash penalty','Cash reward':'Cash reward','Coins added':'Coins added','Commitment after':'Commitment after','Commitment before':'Commitment before','Commitment penalty':'Commitment penalty','Commitment score penalty':'Commitment score penalty','Condition after repair':'Condition after repair','Condition at sale':'Condition at sale','Condition before repair':'Condition before repair','Days remaining':'Days remaining','Days unhappy':'Days unhappy','Days until lock':'Days until lock','Days without selection':'Days without selection','Decision deadline':'Decision deadline','Efficiency gain':'Efficiency gain','Emergency rescue':'Emergency rescue','Emergency rescues used':'Emergency rescues used','Experience gain':'Experience gain','Expertise gain':'Expertise gain','Final due date':'Final due date','Fine applied':'Fine applied','Fine status':'Fine status','First due date':'First due date','Future accepted races · next 30 game days':'Future accepted races · next 30 game days','Garage slot':'Garage slot','Host city':'Host city','If unresolved':'If unresolved','Injured since':'Injured since','Issued on':'Issued on','Leadership gain':'Leadership gain','Locked at':'Locked at','Low-stock items':'Low-stock items','Mandatory obligation':'Mandatory obligation','Medical Center effect':'Medical Center effect','Minimum acceptable salary':'Minimum acceptable salary','Missing kits':'Missing kits','Movement window closes':'Movement window closes','Movement window opens':'Movement window opens','Nature of injury':'Nature of injury','Next accepted future race':'Next accepted future race','Next future race date':'Next future race date','Next step':'Next step','Offered salary':'Offered salary','Offering club':'Offering club','Order cost':'Order cost','Original loan amount':'Original loan amount','Payment status':'Payment status','Period end':'Period end','Period start':'Period start','Previous expected return':'Previous expected return','Prize money':'Prize money','Problem stage plans':'Problem stage plans','Proposed contract':'Proposed contract','Proposed salary':'Proposed salary','Provider':'Provider','Race continues':'Race continues','Race ends':'Race ends','Race starts':'Race starts','Recent race days':'Recent race days','Recommended action':'Recommended action','Recovered from':'Recovered from','Recovered on':'Recovered on','Referral code':'Referral code','Referred manager':'Referred manager','Repair complete':'Repair complete','Repayment period':'Repayment period','Reported on':'Reported on','Requested action':'Requested action','Requested contract':'Requested contract','Required kits':'Required kits','Retired riders':'Retired riders','Retired riders count':'Retired riders count','Retired staff':'Retired staff','Retired staff count':'Retired staff count','Retirement timing':'Retirement timing','Runs until':'Runs until','Sale price':'Sale price','Sender':'Sender','Sent on':'Sent on','Shortfall':'Shortfall','Sick since':'Sick since','Source':'Source','Specialization':'Specialization','Stages to finalise':'Stages to finalise','Starting balance':'Starting balance','Submission':'Submission','Submission deadline':'Submission deadline','Top 3':'Top 3','Total repayment':'Total repayment','Training impact':'Training impact','Unavailable for':'Unavailable for','Unpaid obligation':'Unpaid obligation','Usable kits':'Usable kits','Weekly repayment':'Weekly repayment','Window closes':'Window closes','Window opens':'Window opens','Your rider results':'Your rider results','Your riders listed':'Your riders listed'},
'sr-Latn': {
'Accepted races · next 30 game days':'Prihvaćene trke · sledećih 30 dana igre','Actionable incomplete plans':'Nepotpuni planovi koji zahtevaju radnju','Actionable missing plans':'Nedostajući planovi koji zahtevaju radnju','Advisory':'Savet','Affected / unavailable':'Pogođeno / nedostupno','Affected stage':'Pogođena etapa','Annual value':'Godišnja vrednost','Available cash':'Dostupan novac','Best annual value':'Najbolja godišnja vrednost','Best attribute':'Najbolji atribut','Best team result':'Najbolji rezultat tima','Career start':'Početak karijere','Cash fine':'Novčana kazna','Cash penalty':'Kazna u gotovini','Cash reward':'Novčana nagrada','Coins added':'Dodati novčići','Commitment after':'Posvećenost posle','Commitment before':'Posvećenost pre','Commitment penalty':'Kazna za posvećenost','Commitment score penalty':'Kazna na rezultat posvećenosti','Condition after repair':'Stanje posle popravke','Condition at sale':'Stanje pri prodaji','Condition before repair':'Stanje pre popravke','Days remaining':'Preostalo dana','Days unhappy':'Dana nezadovoljstva','Days until lock':'Dana do zaključavanja','Days without selection':'Dana bez izbora','Decision deadline':'Rok za odluku','Efficiency gain':'Povećanje efikasnosti','Emergency rescue':'Hitno spasavanje','Emergency rescues used':'Iskorišćena hitna spasavanja','Experience gain':'Dobitak iskustva','Expertise gain':'Dobitak stručnosti','Final due date':'Krajnji rok dospeća','Fine applied':'Primenjena kazna','Fine status':'Status kazne','First due date':'Prvi rok dospeća','Future accepted races · next 30 game days':'Buduće prihvaćene trke · sledećih 30 dana igre','Garage slot':'Mesto u garaži','Host city':'Grad domaćin','If unresolved':'Ako se ne reši','Injured since':'Povređen od','Issued on':'Izdato','Leadership gain':'Dobitak liderstva','Locked at':'Zaključano','Low-stock items':'Stavke sa niskim zalihama','Mandatory obligation':'Obavezno zaduženje','Medical Center effect':'Efekat Medicinskog centra','Minimum acceptable salary':'Minimalna prihvatljiva plata','Missing kits':'Nedostajući kompleti','Movement window closes':'Prozor za premeštanje se zatvara','Movement window opens':'Prozor za premeštanje se otvara','Nature of injury':'Vrsta povrede','Next accepted future race':'Sledeća prihvaćena buduća trka','Next future race date':'Datum sledeće buduće trke','Next step':'Sledeći korak','Offered salary':'Ponuđena plata','Offering club':'Klub koji nudi','Order cost':'Cena narudžbine','Original loan amount':'Originalni iznos kredita','Payment status':'Status plaćanja','Period end':'Kraj perioda','Period start':'Početak perioda','Previous expected return':'Prethodno očekivani povratak','Prize money':'Novčana nagrada','Problem stage plans':'Problematični planovi etapa','Proposed contract':'Predloženi ugovor','Proposed salary':'Predložena plata','Provider':'Pružalac','Race continues':'Trka se nastavlja','Race ends':'Trka se završava','Race starts':'Trka počinje','Recent race days':'Nedavni dani trka','Recommended action':'Preporučena radnja','Recovered from':'Oporavljen od','Recovered on':'Oporavljen','Referral code':'Kod preporuke','Referred manager':'Preporučeni menadžer','Repair complete':'Popravka završena','Repayment period':'Period otplate','Reported on':'Prijavljeno','Requested action':'Zahtevana radnja','Requested contract':'Zahtevani ugovor','Required kits':'Potrebni kompleti','Retired riders':'Penzionisani vozači','Retired riders count':'Broj penzionisanih vozača','Retired staff':'Penzionisano osoblje','Retired staff count':'Broj penzionisanog osoblja','Retirement timing':'Vreme odlaska u penziju','Runs until':'Traje do','Sale price':'Prodajna cena','Sender':'Pošiljalac','Sent on':'Poslato','Shortfall':'Manjak','Sick since':'Bolestan od','Source':'Izvor','Specialization':'Specijalizacija','Stages to finalise':'Etape za finalizaciju','Starting balance':'Početno stanje','Submission':'Prijava','Submission deadline':'Rok za prijavu','Top 3':'Top 3','Total repayment':'Ukupna otplata','Training impact':'Uticaj treninga','Unavailable for':'Nedostupan tokom','Unpaid obligation':'Neplaćena obaveza','Usable kits':'Upotrebljivi kompleti','Weekly repayment':'Nedeljna otplata','Window closes':'Prozor se zatvara','Window opens':'Prozor se otvara','Your rider results':'Rezultati vaših vozača','Your riders listed':'Vaši vozači na listi'},
'de': {
'Accepted races · next 30 game days':'Angenommene Rennen · nächste 30 Spieltage','Actionable incomplete plans':'Unvollständige Pläne mit Handlungsbedarf','Actionable missing plans':'Fehlende Pläne mit Handlungsbedarf','Advisory':'Beratung','Affected / unavailable':'Betroffen / nicht verfügbar','Affected stage':'Betroffene Etappe','Annual value':'Jahreswert','Available cash':'Verfügbare Mittel','Best annual value':'Bester Jahreswert','Best attribute':'Bestes Attribut','Best team result':'Bestes Teamergebnis','Career start':'Karrierebeginn','Cash fine':'Geldstrafe','Cash penalty':'Bargeldstrafe','Cash reward':'Geldprämie','Coins added':'Hinzugefügte Coins','Commitment after':'Verpflichtung danach','Commitment before':'Verpflichtung davor','Commitment penalty':'Verpflichtungsstrafe','Commitment score penalty':'Strafe auf den Verpflichtungswert','Condition after repair':'Zustand nach Reparatur','Condition at sale':'Zustand beim Verkauf','Condition before repair':'Zustand vor Reparatur','Days remaining':'Verbleibende Tage','Days unhappy':'Tage unzufrieden','Days until lock':'Tage bis zur Sperre','Days without selection':'Tage ohne Nominierung','Decision deadline':'Entscheidungsfrist','Efficiency gain':'Effizienzgewinn','Emergency rescue':'Notfallrettung','Emergency rescues used':'Verwendete Notfallrettungen','Experience gain':'Erfahrungsgewinn','Expertise gain':'Fachkenntnisgewinn','Final due date':'Endgültiges Fälligkeitsdatum','Fine applied':'Verhängte Strafe','Fine status':'Strafstatus','First due date':'Erstes Fälligkeitsdatum','Future accepted races · next 30 game days':'Zukünftige angenommene Rennen · nächste 30 Spieltage','Garage slot':'Garagenplatz','Host city':'Austragungsort','If unresolved':'Falls ungelöst','Injured since':'Verletzt seit','Issued on':'Ausgestellt am','Leadership gain':'Führungsgewinn','Locked at':'Gesperrt am','Low-stock items':'Artikel mit niedrigem Bestand','Mandatory obligation':'Verbindliche Verpflichtung','Medical Center effect':'Effekt des Medizinzentrums','Minimum acceptable salary':'Mindestakzeptables Gehalt','Missing kits':'Fehlende Sets','Movement window closes':'Wechselfenster schließt','Movement window opens':'Wechselfenster öffnet','Nature of injury':'Art der Verletzung','Next accepted future race':'Nächstes angenommenes zukünftiges Rennen','Next future race date':'Datum des nächsten zukünftigen Rennens','Next step':'Nächster Schritt','Offered salary':'Angebotenes Gehalt','Offering club':'Anbietender Club','Order cost':'Bestellkosten','Original loan amount':'Ursprünglicher Darlehensbetrag','Payment status':'Zahlungsstatus','Period end':'Periodenende','Period start':'Periodenbeginn','Previous expected return':'Bisher erwartete Rückkehr','Prize money':'Preisgeld','Problem stage plans':'Problematische Etappenpläne','Proposed contract':'Vorgeschlagener Vertrag','Proposed salary':'Vorgeschlagenes Gehalt','Provider':'Anbieter','Race continues':'Rennen läuft weiter','Race ends':'Rennen endet','Race starts':'Rennen beginnt','Recent race days':'Kürzliche Renntage','Recommended action':'Empfohlene Aktion','Recovered from':'Genesen von','Recovered on':'Genesen am','Referral code':'Empfehlungscode','Referred manager':'Geworbener Manager','Repair complete':'Reparatur abgeschlossen','Repayment period':'Rückzahlungszeitraum','Reported on':'Gemeldet am','Requested action':'Angeforderte Aktion','Requested contract':'Angeforderter Vertrag','Required kits':'Benötigte Sets','Retired riders':'Fahrer im Ruhestand','Retired riders count':'Anzahl Fahrer im Ruhestand','Retired staff':'Personal im Ruhestand','Retired staff count':'Anzahl Personal im Ruhestand','Retirement timing':'Zeitpunkt des Ruhestands','Runs until':'Läuft bis','Sale price':'Verkaufspreis','Sender':'Absender','Sent on':'Gesendet am','Shortfall':'Fehlbetrag','Sick since':'Krank seit','Source':'Quelle','Specialization':'Spezialisierung','Stages to finalise':'Zu finalisierende Etappen','Starting balance':'Anfangssaldo','Submission':'Einreichung','Submission deadline':'Einreichungsfrist','Top 3':'Top 3','Total repayment':'Gesamtrückzahlung','Training impact':'Trainingseffekt','Unavailable for':'Nicht verfügbar für','Unpaid obligation':'Unbezahlte Verpflichtung','Usable kits':'Nutzbare Sets','Weekly repayment':'Wöchentliche Rückzahlung','Window closes':'Fenster schließt','Window opens':'Fenster öffnet','Your rider results':'Ergebnisse Ihrer Fahrer','Your riders listed':'Ihre gelisteten Fahrer'},
'hr': {
'Accepted races · next 30 game days':'Prihvaćene utrke · sljedećih 30 dana igre','Actionable incomplete plans':'Nepotpuni planovi koji zahtijevaju radnju','Actionable missing plans':'Nedostajući planovi koji zahtijevaju radnju','Advisory':'Savjet','Affected / unavailable':'Pogođeno / nedostupno','Affected stage':'Pogođena etapa','Annual value':'Godišnja vrijednost','Available cash':'Dostupna sredstva','Best annual value':'Najbolja godišnja vrijednost','Best attribute':'Najbolji atribut','Best team result':'Najbolji rezultat tima','Career start':'Početak karijere','Cash fine':'Novčana kazna','Cash penalty':'Kazna u gotovini','Cash reward':'Novčana nagrada','Coins added':'Dodani novčići','Commitment after':'Predanost nakon','Commitment before':'Predanost prije','Commitment penalty':'Kazna za predanost','Commitment score penalty':'Kazna na rezultat predanosti','Condition after repair':'Stanje nakon popravka','Condition at sale':'Stanje pri prodaji','Condition before repair':'Stanje prije popravka','Days remaining':'Preostalo dana','Days unhappy':'Dana nezadovoljstva','Days until lock':'Dana do zaključavanja','Days without selection':'Dana bez odabira','Decision deadline':'Rok za odluku','Efficiency gain':'Povećanje učinkovitosti','Emergency rescue':'Hitno spašavanje','Emergency rescues used':'Iskorištena hitna spašavanja','Experience gain':'Dobitak iskustva','Expertise gain':'Dobitak stručnosti','Final due date':'Krajnji rok dospijeća','Fine applied':'Primijenjena kazna','Fine status':'Status kazne','First due date':'Prvi rok dospijeća','Future accepted races · next 30 game days':'Buduće prihvaćene utrke · sljedećih 30 dana igre','Garage slot':'Mjesto u garaži','Host city':'Grad domaćin','If unresolved':'Ako se ne riješi','Injured since':'Ozlijeđen od','Issued on':'Izdano','Leadership gain':'Dobitak vodstva','Locked at':'Zaključano','Low-stock items':'Stavke s niskim zalihama','Mandatory obligation':'Obvezno zaduženje','Medical Center effect':'Učinak Medicinskog centra','Minimum acceptable salary':'Minimalna prihvatljiva plaća','Missing kits':'Nedostajući kompleti','Movement window closes':'Razdoblje za premještanje se zatvara','Movement window opens':'Razdoblje za premještanje se otvara','Nature of injury':'Vrsta ozljede','Next accepted future race':'Sljedeća prihvaćena buduća utrka','Next future race date':'Datum sljedeće buduće utrke','Next step':'Sljedeći korak','Offered salary':'Ponuđena plaća','Offering club':'Klub koji nudi','Order cost':'Trošak narudžbe','Original loan amount':'Izvorni iznos zajma','Payment status':'Status plaćanja','Period end':'Kraj razdoblja','Period start':'Početak razdoblja','Previous expected return':'Prethodno očekivani povratak','Prize money':'Novčana nagrada','Problem stage plans':'Problematični planovi etapa','Proposed contract':'Predloženi ugovor','Proposed salary':'Predložena plaća','Provider':'Pružatelj','Race continues':'Utrka se nastavlja','Race ends':'Utrka završava','Race starts':'Utrka počinje','Recent race days':'Nedavni dani utrka','Recommended action':'Preporučena radnja','Recovered from':'Oporavljen od','Recovered on':'Oporavljen','Referral code':'Kod preporuke','Referred manager':'Preporučeni menadžer','Repair complete':'Popravak završen','Repayment period':'Razdoblje otplate','Reported on':'Prijavljeno','Requested action':'Zatražena radnja','Requested contract':'Zatraženi ugovor','Required kits':'Potrebni kompleti','Retired riders':'Umirovljeni vozači','Retired riders count':'Broj umirovljenih vozača','Retired staff':'Umirovljeno osoblje','Retired staff count':'Broj umirovljenog osoblja','Retirement timing':'Vrijeme odlaska u mirovinu','Runs until':'Traje do','Sale price':'Prodajna cijena','Sender':'Pošiljatelj','Sent on':'Poslano','Shortfall':'Manjak','Sick since':'Bolestan od','Source':'Izvor','Specialization':'Specijalizacija','Stages to finalise':'Etape za finalizaciju','Starting balance':'Početno stanje','Submission':'Prijava','Submission deadline':'Rok za prijavu','Top 3':'Top 3','Total repayment':'Ukupna otplata','Training impact':'Utjecaj treninga','Unavailable for':'Nedostupan tijekom','Unpaid obligation':'Neplaćena obveza','Usable kits':'Upotrebljivi kompleti','Weekly repayment':'Tjedna otplata','Window closes':'Prozor se zatvara','Window opens':'Prozor se otvara','Your rider results':'Rezultati vaših vozača','Your riders listed':'Vaši vozači na popisu'},
'es': {
'Accepted races · next 30 game days':'Carreras aceptadas · próximos 30 días de juego','Actionable incomplete plans':'Planes incompletos que requieren acción','Actionable missing plans':'Planes faltantes que requieren acción','Advisory':'Asesoramiento','Affected / unavailable':'Afectado / no disponible','Affected stage':'Etapa afectada','Annual value':'Valor anual','Available cash':'Efectivo disponible','Best annual value':'Mejor valor anual','Best attribute':'Mejor atributo','Best team result':'Mejor resultado del equipo','Career start':'Inicio de carrera profesional','Cash fine':'Multa en efectivo','Cash penalty':'Penalización económica','Cash reward':'Recompensa en efectivo','Coins added':'Monedas añadidas','Commitment after':'Compromiso después','Commitment before':'Compromiso antes','Commitment penalty':'Penalización de compromiso','Commitment score penalty':'Penalización de puntuación de compromiso','Condition after repair':'Estado tras la reparación','Condition at sale':'Estado en la venta','Condition before repair':'Estado antes de la reparación','Days remaining':'Días restantes','Days unhappy':'Días descontento','Days until lock':'Días hasta el bloqueo','Days without selection':'Días sin selección','Decision deadline':'Fecha límite de decisión','Efficiency gain':'Ganancia de eficiencia','Emergency rescue':'Rescate de emergencia','Emergency rescues used':'Rescates de emergencia utilizados','Experience gain':'Ganancia de experiencia','Expertise gain':'Ganancia de conocimientos','Final due date':'Fecha límite final','Fine applied':'Multa aplicada','Fine status':'Estado de la multa','First due date':'Primera fecha límite','Future accepted races · next 30 game days':'Carreras futuras aceptadas · próximos 30 días de juego','Garage slot':'Plaza de garaje','Host city':'Ciudad anfitriona','If unresolved':'Si no se resuelve','Injured since':'Lesionado desde','Issued on':'Emitido el','Leadership gain':'Ganancia de liderazgo','Locked at':'Bloqueado el','Low-stock items':'Artículos con pocas existencias','Mandatory obligation':'Obligación de pago obligatoria','Medical Center effect':'Efecto del Centro Médico','Minimum acceptable salary':'Salario mínimo aceptable','Missing kits':'Kits faltantes','Movement window closes':'La ventana de movimiento se cierra','Movement window opens':'La ventana de movimiento se abre','Nature of injury':'Naturaleza de la lesión','Next accepted future race':'Próxima carrera futura aceptada','Next future race date':'Fecha de la próxima carrera futura','Next step':'Siguiente paso','Offered salary':'Salario ofrecido','Offering club':'Club ofertante','Order cost':'Coste del pedido','Original loan amount':'Importe original del préstamo','Payment status':'Estado del pago','Period end':'Fin del período','Period start':'Inicio del período','Previous expected return':'Regreso previsto anteriormente','Prize money':'Premio en metálico','Problem stage plans':'Planes de etapa con problemas','Proposed contract':'Contrato propuesto','Proposed salary':'Salario propuesto','Provider':'Proveedor','Race continues':'La carrera continúa','Race ends':'La carrera termina','Race starts':'La carrera comienza','Recent race days':'Días de carrera recientes','Recommended action':'Acción recomendada','Recovered from':'Recuperado de','Recovered on':'Recuperado el','Referral code':'Código de referido','Referred manager':'Mánager referido','Repair complete':'Reparación completada','Repayment period':'Período de reembolso','Reported on':'Informado el','Requested action':'Acción solicitada','Requested contract':'Contrato solicitado','Required kits':'Kits necesarios','Retired riders':'Corredores retirados','Retired riders count':'Número de corredores retirados','Retired staff':'Personal retirado','Retired staff count':'Número de miembros del personal retirados','Retirement timing':'Momento de la retirada','Runs until':'Vigente hasta','Sale price':'Precio de venta','Sender':'Remitente','Sent on':'Enviado el','Shortfall':'Déficit','Sick since':'Enfermo desde','Source':'Fuente','Specialization':'Especialización','Stages to finalise':'Etapas por finalizar','Starting balance':'Saldo inicial','Submission':'Envío','Submission deadline':'Fecha límite de envío','Top 3':'Top 3','Total repayment':'Reembolso total','Training impact':'Impacto del entrenamiento','Unavailable for':'No disponible durante','Unpaid obligation':'Obligación impagada','Usable kits':'Kits utilizables','Weekly repayment':'Reembolso semanal','Window closes':'La ventana se cierra','Window opens':'La ventana se abre','Your rider results':'Resultados de tus corredores','Your riders listed':'Tus corredores listados'},
'it': {
'Accepted races · next 30 game days':'Gare accettate · prossimi 30 giorni di gioco','Actionable incomplete plans':'Piani incompleti che richiedono un’azione','Actionable missing plans':'Piani mancanti che richiedono un’azione','Advisory':'Consulenza','Affected / unavailable':'Interessato / non disponibile','Affected stage':'Tappa interessata','Annual value':'Valore annuale','Available cash':'Liquidità disponibile','Best annual value':'Miglior valore annuale','Best attribute':'Miglior attributo','Best team result':'Miglior risultato della squadra','Career start':'Inizio carriera','Cash fine':'Multa in contanti','Cash penalty':'Penalità economica','Cash reward':'Premio in denaro','Coins added':'Monete aggiunte','Commitment after':'Impegno dopo','Commitment before':'Impegno prima','Commitment penalty':'Penalità per l’impegno','Commitment score penalty':'Penalità sul punteggio di impegno','Condition after repair':'Condizione dopo la riparazione','Condition at sale':'Condizione alla vendita','Condition before repair':'Condizione prima della riparazione','Days remaining':'Giorni rimanenti','Days unhappy':'Giorni di malcontento','Days until lock':'Giorni al blocco','Days without selection':'Giorni senza selezione','Decision deadline':'Scadenza decisione','Efficiency gain':'Aumento di efficienza','Emergency rescue':'Soccorso di emergenza','Emergency rescues used':'Soccorsi di emergenza utilizzati','Experience gain':'Aumento esperienza','Expertise gain':'Aumento competenza','Final due date':'Scadenza finale','Fine applied':'Multa applicata','Fine status':'Stato della multa','First due date':'Prima scadenza','Future accepted races · next 30 game days':'Gare future accettate · prossimi 30 giorni di gioco','Garage slot':'Posto in garage','Host city':'Città ospitante','If unresolved':'Se non risolto','Injured since':'Infortunato dal','Issued on':'Emesso il','Leadership gain':'Aumento leadership','Locked at':'Bloccato il','Low-stock items':'Articoli con scorte basse','Mandatory obligation':'Obbligo vincolante','Medical Center effect':'Effetto del Centro Medico','Minimum acceptable salary':'Stipendio minimo accettabile','Missing kits':'Kit mancanti','Movement window closes':'La finestra di movimento si chiude','Movement window opens':'La finestra di movimento si apre','Nature of injury':'Natura dell’infortunio','Next accepted future race':'Prossima gara futura accettata','Next future race date':'Data della prossima gara futura','Next step':'Passaggio successivo','Offered salary':'Stipendio offerto','Offering club':'Club offerente','Order cost':'Costo dell’ordine','Original loan amount':'Importo originale del prestito','Payment status':'Stato del pagamento','Period end':'Fine periodo','Period start':'Inizio periodo','Previous expected return':'Rientro precedentemente previsto','Prize money':'Montepremi','Problem stage plans':'Piani di tappa problematici','Proposed contract':'Contratto proposto','Proposed salary':'Stipendio proposto','Provider':'Fornitore','Race continues':'La gara continua','Race ends':'La gara termina','Race starts':'La gara inizia','Recent race days':'Giorni di gara recenti','Recommended action':'Azione consigliata','Recovered from':'Guarito da','Recovered on':'Guarito il','Referral code':'Codice referral','Referred manager':'Manager segnalato','Repair complete':'Riparazione completata','Repayment period':'Periodo di rimborso','Reported on':'Segnalato il','Requested action':'Azione richiesta','Requested contract':'Contratto richiesto','Required kits':'Kit necessari','Retired riders':'Corridori ritirati','Retired riders count':'Numero di corridori ritirati','Retired staff':'Staff ritirato','Retired staff count':'Numero di membri dello staff ritirati','Retirement timing':'Tempistica del ritiro','Runs until':'Valido fino a','Sale price':'Prezzo di vendita','Sender':'Mittente','Sent on':'Inviato il','Shortfall':'Ammanco','Sick since':'Malato dal','Source':'Fonte','Specialization':'Specializzazione','Stages to finalise':'Tappe da finalizzare','Starting balance':'Saldo iniziale','Submission':'Invio','Submission deadline':'Scadenza invio','Top 3':'Top 3','Total repayment':'Rimborso totale','Training impact':'Impatto dell’allenamento','Unavailable for':'Non disponibile per','Unpaid obligation':'Obbligo non pagato','Usable kits':'Kit utilizzabili','Weekly repayment':'Rimborso settimanale','Window closes':'La finestra si chiude','Window opens':'La finestra si apre','Your rider results':'Risultati dei tuoi corridori','Your riders listed':'I tuoi corridori in lista'},
'fr': {
'Accepted races · next 30 game days':'Courses acceptées · 30 prochains jours de jeu','Actionable incomplete plans':'Plans incomplets nécessitant une action','Actionable missing plans':'Plans manquants nécessitant une action','Advisory':'Conseil','Affected / unavailable':'Concerné / indisponible','Affected stage':'Étape concernée','Annual value':'Valeur annuelle','Available cash':'Trésorerie disponible','Best annual value':'Meilleure valeur annuelle','Best attribute':'Meilleur attribut','Best team result':'Meilleur résultat de l’équipe','Career start':'Début de carrière','Cash fine':'Amende en espèces','Cash penalty':'Pénalité financière','Cash reward':'Récompense en espèces','Coins added':'Pièces ajoutées','Commitment after':'Engagement après','Commitment before':'Engagement avant','Commitment penalty':'Pénalité d’engagement','Commitment score penalty':'Pénalité sur le score d’engagement','Condition after repair':'État après réparation','Condition at sale':'État lors de la vente','Condition before repair':'État avant réparation','Days remaining':'Jours restants','Days unhappy':'Jours de mécontentement','Days until lock':'Jours avant verrouillage','Days without selection':'Jours sans sélection','Decision deadline':'Date limite de décision','Efficiency gain':'Gain d’efficacité','Emergency rescue':'Sauvetage d’urgence','Emergency rescues used':'Sauvetages d’urgence utilisés','Experience gain':'Gain d’expérience','Expertise gain':'Gain d’expertise','Final due date':'Échéance finale','Fine applied':'Amende appliquée','Fine status':'Statut de l’amende','First due date':'Première échéance','Future accepted races · next 30 game days':'Courses futures acceptées · 30 prochains jours de jeu','Garage slot':'Place de garage','Host city':'Ville hôte','If unresolved':'Si non résolu','Injured since':'Blessé depuis','Issued on':'Émis le','Leadership gain':'Gain de leadership','Locked at':'Verrouillé le','Low-stock items':'Articles en stock faible','Mandatory obligation':'Obligation impérative','Medical Center effect':'Effet du Centre médical','Minimum acceptable salary':'Salaire minimum acceptable','Missing kits':'Kits manquants','Movement window closes':'La fenêtre de mouvement se ferme','Movement window opens':'La fenêtre de mouvement s’ouvre','Nature of injury':'Nature de la blessure','Next accepted future race':'Prochaine course future acceptée','Next future race date':'Date de la prochaine course future','Next step':'Étape suivante','Offered salary':'Salaire proposé','Offering club':'Club offrant','Order cost':'Coût de la commande','Original loan amount':'Montant initial du prêt','Payment status':'Statut du paiement','Period end':'Fin de période','Period start':'Début de période','Previous expected return':'Retour précédemment prévu','Prize money':'Prix en argent','Problem stage plans':'Plans d’étape problématiques','Proposed contract':'Contrat proposé','Proposed salary':'Salaire proposé','Provider':'Fournisseur','Race continues':'La course continue','Race ends':'La course se termine','Race starts':'La course commence','Recent race days':'Jours de course récents','Recommended action':'Action recommandée','Recovered from':'Rétabli de','Recovered on':'Rétabli le','Referral code':'Code de parrainage','Referred manager':'Manager parrainé','Repair complete':'Réparation terminée','Repayment period':'Période de remboursement','Reported on':'Signalé le','Requested action':'Action demandée','Requested contract':'Contrat demandé','Required kits':'Kits requis','Retired riders':'Coureurs retraités','Retired riders count':'Nombre de coureurs retraités','Retired staff':'Personnel retraité','Retired staff count':'Nombre de membres du personnel retraités','Retirement timing':'Date du départ à la retraite','Runs until':'Valable jusqu’au','Sale price':'Prix de vente','Sender':'Expéditeur','Sent on':'Envoyé le','Shortfall':'Manque','Sick since':'Malade depuis','Source':'Source','Specialization':'Spécialisation','Stages to finalise':'Étapes à finaliser','Starting balance':'Solde initial','Submission':'Soumission','Submission deadline':'Date limite de soumission','Top 3':'Top 3','Total repayment':'Remboursement total','Training impact':'Impact de l’entraînement','Unavailable for':'Indisponible pour','Unpaid obligation':'Obligation impayée','Usable kits':'Kits utilisables','Weekly repayment':'Remboursement hebdomadaire','Window closes':'La fenêtre se ferme','Window opens':'La fenêtre s’ouvre','Your rider results':'Résultats de vos coureurs','Your riders listed':'Vos coureurs listés'},
'ru': {
'Accepted races · next 30 game days':'Принятые гонки · следующие 30 игровых дней','Actionable incomplete plans':'Неполные планы, требующие действий','Actionable missing plans':'Отсутствующие планы, требующие действий','Advisory':'Рекомендация','Affected / unavailable':'Затронут / недоступен','Affected stage':'Затронутый этап','Annual value':'Годовая стоимость','Available cash':'Доступные средства','Best annual value':'Лучшая годовая стоимость','Best attribute':'Лучший атрибут','Best team result':'Лучший результат команды','Career start':'Начало карьеры','Cash fine':'Денежный штраф','Cash penalty':'Финансовый штраф','Cash reward':'Денежная награда','Coins added':'Добавленные монеты','Commitment after':'Приверженность после','Commitment before':'Приверженность до','Commitment penalty':'Штраф за приверженность','Commitment score penalty':'Штраф к показателю приверженности','Condition after repair':'Состояние после ремонта','Condition at sale':'Состояние при продаже','Condition before repair':'Состояние до ремонта','Days remaining':'Осталось дней','Days unhappy':'Дней недовольства','Days until lock':'Дней до блокировки','Days without selection':'Дней без выбора','Decision deadline':'Срок принятия решения','Efficiency gain':'Прирост эффективности','Emergency rescue':'Экстренное спасение','Emergency rescues used':'Использовано экстренных спасений','Experience gain':'Прирост опыта','Expertise gain':'Прирост квалификации','Final due date':'Окончательный срок оплаты','Fine applied':'Штраф применён','Fine status':'Статус штрафа','First due date':'Первый срок оплаты','Future accepted races · next 30 game days':'Будущие принятые гонки · следующие 30 игровых дней','Garage slot':'Место в гараже','Host city':'Город-организатор','If unresolved':'Если не решено','Injured since':'Травмирован с','Issued on':'Выдано','Leadership gain':'Прирост лидерства','Locked at':'Заблокировано','Low-stock items':'Позиции с низким запасом','Mandatory obligation':'Обязательный платёж','Medical Center effect':'Эффект медицинского центра','Minimum acceptable salary':'Минимально приемлемая зарплата','Missing kits':'Недостающие комплекты','Movement window closes':'Окно переходов закрывается','Movement window opens':'Окно переходов открывается','Nature of injury':'Характер травмы','Next accepted future race':'Следующая принятая будущая гонка','Next future race date':'Дата следующей будущей гонки','Next step':'Следующий шаг','Offered salary':'Предложенная зарплата','Offering club':'Предлагающий клуб','Order cost':'Стоимость заказа','Original loan amount':'Первоначальная сумма займа','Payment status':'Статус платежа','Period end':'Конец периода','Period start':'Начало периода','Previous expected return':'Ранее ожидаемое возвращение','Prize money':'Призовые','Problem stage plans':'Проблемные планы этапов','Proposed contract':'Предложенный контракт','Proposed salary':'Предложенная зарплата','Provider':'Поставщик','Race continues':'Гонка продолжается','Race ends':'Гонка заканчивается','Race starts':'Гонка начинается','Recent race days':'Недавние гоночные дни','Recommended action':'Рекомендуемое действие','Recovered from':'Восстановился после','Recovered on':'Восстановился','Referral code':'Реферальный код','Referred manager':'Приглашённый менеджер','Repair complete':'Ремонт завершён','Repayment period':'Период погашения','Reported on':'Сообщено','Requested action':'Запрошенное действие','Requested contract':'Запрошенный контракт','Required kits':'Необходимые комплекты','Retired riders':'Завершившие карьеру гонщики','Retired riders count':'Количество завершивших карьеру гонщиков','Retired staff':'Вышедший на пенсию персонал','Retired staff count':'Количество вышедших на пенсию сотрудников','Retirement timing':'Срок выхода на пенсию','Runs until':'Действует до','Sale price':'Цена продажи','Sender':'Отправитель','Sent on':'Отправлено','Shortfall':'Дефицит','Sick since':'Болеет с','Source':'Источник','Specialization':'Специализация','Stages to finalise':'Этапы для завершения','Starting balance':'Начальный баланс','Submission':'Подача','Submission deadline':'Срок подачи','Top 3':'Топ-3','Total repayment':'Общая сумма погашения','Training impact':'Влияние тренировки','Unavailable for':'Недоступен в течение','Unpaid obligation':'Неоплаченное обязательство','Usable kits':'Пригодные комплекты','Weekly repayment':'Еженедельное погашение','Window closes':'Окно закрывается','Window opens':'Окно открывается','Your rider results':'Результаты ваших гонщиков','Your riders listed':'Ваши гонщики в списке'},
}

ACTIONS = {
'en': {'Club finances':'Club finances','Maintenance':'Maintenance','Release options':'Release options','Resupply Now':'Resupply Now'},
'sr-Latn': {'Club finances':'Finansije kluba','Maintenance':'Održavanje','Release options':'Opcije raskida ugovora','Resupply Now':'Dopuni zalihe sada'},
'de': {'Club finances':'Clubfinanzen','Maintenance':'Wartung','Release options':'Optionen zur Vertragsauflösung','Resupply Now':'Jetzt nachfüllen'},
'hr': {'Club finances':'Financije kluba','Maintenance':'Održavanje','Release options':'Opcije raskida ugovora','Resupply Now':'Nadopuni zalihe sada'},
'es': {'Club finances':'Finanzas del club','Maintenance':'Mantenimiento','Release options':'Opciones de rescisión','Resupply Now':'Reponer ahora'},
'it': {'Club finances':'Finanze del club','Maintenance':'Manutenzione','Release options':'Opzioni di svincolo','Resupply Now':'Rifornisci ora'},
'fr': {'Club finances':'Finances du club','Maintenance':'Maintenance','Release options':'Options de libération','Resupply Now':'Réapprovisionner maintenant'},
'ru': {'Club finances':'Финансы клуба','Maintenance':'Обслуживание','Release options':'Варианты расторжения','Resupply Now':'Пополнить запасы сейчас'},
}

# Add exact literal coverage to notifications locales.
for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data['literalDetailLabels'] = DETAILS[locale]
    data['literalActionLabels'] = ACTIONS[locale]

    # Fix a few visible legacy Croatian token typos / English leaks while here.
    if locale == 'hr':
        words = data.setdefault('templateWords', {})
        words['CAMP'] = 'Kamp'
        words['PENALTY'] = 'Kazna'
        words['COIN'] = 'Novčić'
        words['COINS'] = 'Novčići'
        words['FINALIZED'] = 'Finalizirano'
        words['FINALISED'] = 'Finalizirano'
    if locale == 'sr-Latn':
        words = data.setdefault('templateWords', {})
        words['COIN'] = 'Novčić'
        words['COINS'] = 'Novčići'

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Patch the notification runtime with cross-namespace exact lookup and reusable
# token fallback. Exact locale literal maps are preferred for phrases that need
# natural grammar.
loc_path = ROOT / 'src/features/notifications/notificationLocalization.ts'
text = loc_path.read_text(encoding='utf-8')

helper_anchor = """function localizeRole(value: string | null): string | null {
"""
helpers = r'''type EnglishResourceHit = { namespace: string; keyPath: string }
let englishResourceIndex: Map<string, EnglishResourceHit[]> | null = null

function activeLanguageCode(): string {
  return String(i18n.resolvedLanguage ?? i18n.language ?? 'en')
}

function readResourceString(bundle: unknown, keyPath: string): string | null {
  if (!bundle || typeof bundle !== 'object') return null
  let current: unknown = bundle
  for (const segment of keyPath.split('.')) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null
}

function indexEnglishBundle(
  target: Map<string, EnglishResourceHit[]>,
  namespace: string,
  value: unknown,
  keyPath = ''
): void {
  if (typeof value === 'string') {
    if (!value.includes('{{') && value.trim()) {
      const normalized = normalizePhrase(value)
      const rows = target.get(normalized) ?? []
      rows.push({ namespace, keyPath })
      target.set(normalized, rows)
    }
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    indexEnglishBundle(target, namespace, child, keyPath ? `${keyPath}.${key}` : key)
  })
}

function getEnglishResourceIndex(): Map<string, EnglishResourceHit[]> {
  if (englishResourceIndex) return englishResourceIndex
  const next = new Map<string, EnglishResourceHit[]>()
  const englishData = i18n.getDataByLanguage('en') as Record<string, unknown> | undefined
  if (englishData) {
    Object.entries(englishData).forEach(([namespace, bundle]) => {
      indexEnglishBundle(next, namespace, bundle)
    })
  }
  englishResourceIndex = next
  return next
}

function localizeExistingGamePhrase(value: string): string | null {
  if (!shouldLocalizeNotifications() || !value.trim()) return null
  const hits = getEnglishResourceIndex().get(normalizePhrase(value)) ?? []
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  if (!languageData) return null

  for (const hit of hits) {
    const localized = readResourceString(languageData[hit.namespace], hit.keyPath)
    if (localized && !localized.includes('{{')) return localized
  }
  return null
}

function notificationLiteral(section: 'literalDetailLabels' | 'literalActionLabels', raw: string): string | null {
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  const notifications = languageData?.notifications
  if (!notifications || typeof notifications !== 'object') return null
  const sectionValue = (notifications as Record<string, unknown>)[section]
  if (!sectionValue || typeof sectionValue !== 'object') return null
  const value = (sectionValue as Record<string, unknown>)[raw.trim()]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function notificationTemplateWord(raw: string): string | null {
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  const notifications = languageData?.notifications
  if (!notifications || typeof notifications !== 'object') return null
  const words = (notifications as Record<string, unknown>).templateWords
  if (!words || typeof words !== 'object') return null
  const value = (words as Record<string, unknown>)[raw.toUpperCase()]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function localizeLabelByReusableTokens(raw: string): string | null {
  let failed = false
  let translatedCount = 0
  const translated = raw.replace(/[A-Za-z][A-Za-z0-9'-]*/g, word => {
    const localized = notificationTemplateWord(word) || localizeExistingGamePhrase(word)
    if (!localized) {
      failed = true
      return word
    }
    translatedCount += 1
    return localized
  })
  return !failed && translatedCount > 0 ? translated : null
}

function localizeRole(value: string | null): string | null {
'''
if 'function localizeExistingGamePhrase' not in text:
    if helper_anchor not in text:
        raise SystemExit('notification helper insertion anchor not found')
    text = text.replace(helper_anchor, helpers, 1)

old_detail = """export function localizeNotificationDetailLabel(label: string): string {
  if (!shouldLocalizeNotifications()) return label
  const key = DETAIL_LABEL_KEYS[normalizePhrase(label)]
  return key ? nt(key) : nt('common.detail')
}
"""
new_detail = """export function localizeNotificationDetailLabel(label: string): string {
  if (!shouldLocalizeNotifications()) return label
  const key = DETAIL_LABEL_KEYS[normalizePhrase(label)]
  if (key) return nt(key)

  const literal = notificationLiteral('literalDetailLabels', label)
  if (literal) return literal

  const existing = localizeExistingGamePhrase(label)
  if (existing) return existing

  const tokenized = localizeLabelByReusableTokens(label)
  return tokenized || nt('common.detail')
}
"""
if old_detail in text:
    text = text.replace(old_detail, new_detail, 1)
elif new_detail not in text:
    raise SystemExit('detail localizer block not found')

old_action = """export function localizeNotificationActionLabel(label: string): string {
  if (!shouldLocalizeNotifications()) return label
  const normalized = normalizePhrase(label)
  const key = ACTION_KEY_BY_LABEL[normalized]
  if (key) return nt(key)
  if (normalized.startsWith('open ')) return nt('details.open')
  if (normalized.startsWith('review ') || normalized.startsWith('check ')) {
    return nt('details.review')
  }
  return nt('details.open')
}
"""
new_action = """export function localizeNotificationActionLabel(label: string): string {
  if (!shouldLocalizeNotifications()) return label
  const normalized = normalizePhrase(label)
  const key = ACTION_KEY_BY_LABEL[normalized]
  if (key) return nt(key)

  const literal = notificationLiteral('literalActionLabels', label)
  if (literal) return literal

  const existing = localizeExistingGamePhrase(label)
  if (existing) return existing

  const tokenized = localizeLabelByReusableTokens(label)
  if (tokenized) return tokenized

  if (normalized.startsWith('open ')) return nt('details.open')
  if (normalized.startsWith('review ') || normalized.startsWith('check ')) {
    return nt('details.review')
  }
  return nt('details.open')
}
"""
if old_action in text:
    text = text.replace(old_action, new_action, 1)
elif new_action not in text:
    raise SystemExit('action localizer block not found')

value_anchor = """  if (/\\/week\\b/i.test(value)) {
    return value.replace(/\\/week\\b/gi, `/${nt('templateLocalization.perWeek')}`)
  }

  return value
}"""
value_replacement = """  const existingGamePhrase = localizeExistingGamePhrase(value)
  if (existingGamePhrase) return existingGamePhrase

  // Short metadata values frequently reuse the same vocabulary as labels.
  // Translate them token-by-token only when every English token has a known
  // localized equivalent; otherwise preserve dynamic names/identifiers.
  if (value.length <= 120) {
    const tokenized = localizeLabelByReusableTokens(value)
    if (tokenized) return tokenized
  }

  if (/\\/week\\b/i.test(value)) {
    return value.replace(/\\/week\\b/gi, `/${nt('templateLocalization.perWeek')}`)
  }

  return value
}"""
if 'const existingGamePhrase = localizeExistingGamePhrase(value)' not in text:
    if value_anchor not in text:
        raise SystemExit('value fallback anchor not found')
    text = text.replace(value_anchor, value_replacement, 1)

loc_path.write_text(text, encoding='utf-8')

# Finance game-date labels: do not hardcode English "Season" / "Month".
game_date_path = ROOT / 'src/pages/dashboard/finance/gameDate.ts'
game_date = game_date_path.read_text(encoding='utf-8')
if "import i18n from '@/i18n'" not in game_date:
    game_date = "import i18n from '@/i18n'\n\n" + game_date

old_base = """  const base = `${pad2(parts.day)}/${pad2(parts.month)}, Season ${parts.season}`
"""
new_base = """  const seasonLabel = String(i18n.t('common.season', { ns: 'finance', defaultValue: 'Season' }))
  const base = `${pad2(parts.day)}/${pad2(parts.month)}, ${seasonLabel} ${parts.season}`
"""
if old_base in game_date:
    game_date = game_date.replace(old_base, new_base, 1)

old_range = """    return `${pad2(s.day)}/${pad2(s.month)} → ${pad2(e.day)}/${pad2(e.month)}, Season ${s.season}`
"""
new_range = """    const seasonLabel = String(i18n.t('common.season', { ns: 'finance', defaultValue: 'Season' }))
    return `${pad2(s.day)}/${pad2(s.month)} → ${pad2(e.day)}/${pad2(e.month)}, ${seasonLabel} ${s.season}`
"""
if old_range in game_date:
    game_date = game_date.replace(old_range, new_range, 1)

old_month = """  if (!match) return 'Unknown game month'

  return `Month ${Number(match[2])}, Season ${Number(match[1])}`
"""
new_month = """  if (!match) return String(i18n.t('common.unknownGameMonth', { ns: 'finance', defaultValue: 'Unknown game month' }))

  const monthLabel = String(i18n.t('common.month', { ns: 'finance', defaultValue: 'Month' }))
  const seasonLabel = String(i18n.t('common.season', { ns: 'finance', defaultValue: 'Season' }))
  return `${monthLabel} ${Number(match[2])}, ${seasonLabel} ${Number(match[1])}`
"""
if old_month in game_date:
    game_date = game_date.replace(old_month, new_month, 1)

game_date_path.write_text(game_date, encoding='utf-8')

finance_terms = {
'en': {'season':'Season','month':'Month','unknownGameMonth':'Unknown game month'},
'sr-Latn': {'season':'Sezona','month':'Mesec','unknownGameMonth':'Nepoznat mesec igre'},
'de': {'season':'Saison','month':'Monat','unknownGameMonth':'Unbekannter Spielmonat'},
'hr': {'season':'Sezona','month':'Mjesec','unknownGameMonth':'Nepoznati mjesec igre'},
'es': {'season':'Temporada','month':'Mes','unknownGameMonth':'Mes de juego desconocido'},
'it': {'season':'Stagione','month':'Mese','unknownGameMonth':'Mese di gioco sconosciuto'},
'fr': {'season':'Saison','month':'Mois','unknownGameMonth':'Mois de jeu inconnu'},
'ru': {'season':'Сезон','month':'Месяц','unknownGameMonth':'Неизвестный игровой месяц'},
}
for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'finance.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data.setdefault('common', {}).update(finance_terms[locale])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Applied comprehensive notification literal coverage and localized finance game dates')
