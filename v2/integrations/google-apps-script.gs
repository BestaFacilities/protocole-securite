/**
 * REGISTRE DES PROTOCOLES + ENVOI DES E-MAILS PAR GMAIL (GRATUIT)
 * ------------------------------------------------------------------------------------------------
 * Ce script, installé dans un Google Sheet, fait 4 choses :
 *   1. chaque protocole validé ajoute une ligne dans l'onglet « Protocoles » et le PDF signé
 *      est rangé dans le dossier Google Drive « Protocoles de sécurité – GARE ISSY » ;
 *   2. si Render est réglé avec MAIL_VIA=gmail, il envoie aussi l'e-mail du protocole
 *      DEPUIS CE COMPTE GMAIL (bien mieux reçu par Outlook que Brevo avec une adresse @outlook.fr) ;
 *   3. il envoie les e-mails d'alerte du serveur (plafond journalier atteint…) ;
 *   4. chaque soir, il envoie un résumé des livraisons du jour (à activer une fois, voir étape 7).
 * Si ce script est en panne, le serveur Render repasse automatiquement par Brevo : le chauffeur est quand même validé.
 *
 * INSTALLATION (15 minutes, avec le compte Google qui enverra les e-mails) :
 *  1. Créer un Google Sheet vide nommé « Registre protocoles GARE ISSY ».
 *  2. Menu Extensions → Apps Script. Effacer le contenu et coller CE fichier.
 *  3. Remplacer SECRET ci-dessous par une phrase longue et aléatoire (la même que SHEETS_WEBHOOK_SECRET sur Render).
 *     Vérifier RESUME_A (destinataire du résumé du soir).
 *  4. Roue dentée « Paramètres du projet » → Fuseau horaire : (GMT+01:00) Paris.
 *  5. Déployer → Nouveau déploiement → type « Application Web »
 *       - Exécuter en tant que : Moi
 *       - Qui a accès : Tout le monde
 *     Autoriser les accès demandés (Sheets, Drive, envoi d'e-mails), puis copier l'URL qui se termine par /exec.
 *  6. Sur Render (Environment) :
 *       SHEETS_WEBHOOK_URL    = l'URL /exec
 *       SHEETS_WEBHOOK_SECRET = la même phrase que SECRET
 *       MAIL_VIA              = gmail      (pour envoyer les e-mails par Gmail ; sinon ne pas mettre)
 *  7. Résumé du soir : dans l'éditeur Apps Script, choisir la fonction « installerResumeQuotidien »
 *     dans la liste en haut, puis cliquer sur « Exécuter » (une seule fois). Résumé chaque jour vers 18 h.
 *  8. Faire un protocole de test : une ligne apparaît dans l'onglet « Protocoles », le PDF dans Drive,
 *     et l'e-mail arrive depuis l'adresse Gmail.
 *
 * Après une modification de ce script : Déployer → Gérer les déploiements → Modifier (crayon)
 * → Version : « Nouvelle version » → Déployer. (L'URL /exec reste la même.)
 */

const SECRET = 'REMPLACER-PAR-UNE-PHRASE-SECRETE-LONGUE';
const RESUME_A = 'bestafacilities@outlook.fr';   // destinataire(s) du résumé du soir, séparés par des virgules
const HEURE_RESUME = 18;                          // heure d'envoi du résumé (approximative, à ± 1 h près)
const NOM_EXPEDITEUR = 'Gare Logistique';
const ONGLET = 'Protocoles';
const DOSSIER_DRIVE = 'Protocoles de sécurité – GARE ISSY';

const COLONNES = [
  ['reference', 'Référence'],
  ['horodatage', 'Date et heure'],
  ['chantier', 'Chantier'],
  ['chauffeur', 'Chauffeur'],
  ['telephone', 'Téléphone'],
  ['transporteur', 'Transporteur'],
  ['fournisseur', 'Fournisseur'],
  ['entreprise_livree', 'Entreprise livrée'],
  ['immatriculation', 'Immatriculation'],
  ['operation', 'Opération'],
  ['realisation', 'Réalisé par'],
  ['matieres', 'Matières transportées'],
  ['produits_dangereux', 'Produits dangereux'],
  ['conditionnement', 'Conditionnement'],
  ['poids', 'Poids élément le plus lourd'],
  ['dimensions', 'Dimensions'],
  ['vehicule', 'Véhicule'],
  ['hauteur_inf_4m2', 'Hauteur < 4,2 m'],
  ['longueur_inf_8m', 'Longueur < 8 m'],
  ['manutention', 'Moyens de manutention'],
  ['distance_chantier_m', 'Distance chantier (m)'],
  ['alertes', 'Points de vigilance'],
  ['langue', 'Langue'],
  ['appareil', 'Appareil'],
  ['ip', 'Adresse IP'],
  ['empreinte', 'Empreinte SHA-256 du PDF'],
];
// Colonnes ajoutées après les données
const COL_PDF = COLONNES.length + 1;      // lien vers le PDF dans Drive
const COL_GMAIL = COLONNES.length + 2;    // « oui » si l'e-mail est parti par Gmail
const COL_ID = COLONNES.length + 3;       // identifiant technique du formulaire (anti-doublon)

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data || data.secret !== SECRET) return json_({ ok: false, error: 'secret invalide' });

    // E-mail d'alerte envoyé par le serveur (pas de ligne dans le registre)
    if (data.alerte) {
      MailApp.sendEmail({ to: data.alerte.to || RESUME_A, subject: data.alerte.subject, body: data.alerte.text, name: NOM_EXPEDITEUR });
      return json_({ ok: true, mailed: true });
    }

    const l = data.ligne || {};
    lock.waitLock(20000);
    const sheet = feuille_();

    // Anti-doublon : si ce formulaire a déjà été archivé, on ne recrée pas la ligne
    let rang = trouverLigne_(sheet, l.id_formulaire || l.reference);
    let dejaEnvoye = false;
    if (rang) {
      dejaEnvoye = sheet.getRange(rang, COL_GMAIL).getValue() === 'oui';
    } else {
      let lienPdf = '';
      if (data.pdf && data.pdf.base64) {
        const blob = Utilities.newBlob(Utilities.base64Decode(data.pdf.base64), 'application/pdf', data.pdf.nom || (l.reference + '.pdf'));
        lienPdf = dossier_().createFile(blob).getUrl();
      }
      const ligne = COLONNES.map(([cle]) => nettoie_(l[cle]));
      ligne.push(lienPdf, 'non', nettoie_(l.id_formulaire || l.reference));
      sheet.appendRow(ligne);
      rang = sheet.getLastRow();
      if (l.alertes) sheet.getRange(rang, 1, 1, ligne.length).setBackground('#fff4e5');
    }
    lock.releaseLock();

    // Envoi de l'e-mail par Gmail (si demandé et pas déjà fait)
    let mailed = dejaEnvoye;
    let mailError = '';
    if (data.mail && !dejaEnvoye) {
      try {
        if (MailApp.getRemainingDailyQuota() < 1) throw new Error('quota Gmail du jour atteint');
        const m = data.mail;
        const options = {
          to: m.to || RESUME_A,
          subject: m.subject,
          htmlBody: m.html,
          body: m.text,
          name: m.name || NOM_EXPEDITEUR,
        };
        if (m.bcc) options.bcc = m.bcc;
        if (m.replyTo) options.replyTo = m.replyTo;
        if (data.pdf && data.pdf.base64) {
          options.attachments = [Utilities.newBlob(Utilities.base64Decode(data.pdf.base64), 'application/pdf', data.pdf.nom || 'protocole.pdf')];
        }
        MailApp.sendEmail(options);
        sheet.getRange(rang, COL_GMAIL).setValue('oui');
        mailed = true;
      } catch (errMail) {
        mailError = String(errMail);
      }
    }
    return json_({ ok: true, archived: true, mailed: mailed, mailError: mailError });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* rien */ }
  }
}

// Permet de vérifier l'URL dans un navigateur
function doGet() {
  return json_({ ok: true, service: 'registre protocoles' });
}

// ------------------------------------------------------------------ résumé du soir

/** À exécuter UNE fois à la main : programme l'envoi du résumé chaque jour vers HEURE_RESUME h. */
function installerResumeQuotidien() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'resumeQuotidien'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('resumeQuotidien').timeBased().everyDays(1).atHour(HEURE_RESUME).create();
}

/** Envoie la liste des livraisons du jour (rien n'est envoyé s'il n'y en a aucune). */
function resumeQuotidien() {
  const sheet = feuille_();
  const fuseau = Session.getScriptTimeZone();
  const aujourdhui = Utilities.formatDate(new Date(), fuseau, 'dd/MM/yyyy');
  if (sheet.getLastRow() < 2) return;
  const valeurs = sheet.getRange(2, 1, sheet.getLastRow() - 1, COL_ID).getValues();
  const idx = {};
  COLONNES.forEach(function (c, i) { idx[c[0]] = i; });

  const lignes = valeurs.filter(function (v) {
    const h = v[idx.horodatage];
    const texte = h instanceof Date ? Utilities.formatDate(h, fuseau, 'dd/MM/yyyy') : String(h);
    return texte.indexOf(aujourdhui) === 0;
  });
  if (!lignes.length) return;

  const esc = function (s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const heure = function (h) { return h instanceof Date ? Utilities.formatDate(h, fuseau, 'HH:mm') : String(h).substr(11, 5); };
  const nbAlertes = lignes.filter(function (v) { return v[idx.alertes]; }).length;

  let html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">'
    + '<h2 style="color:#000048;margin:0 0 6px;">Livraisons du ' + aujourdhui + '</h2>'
    + '<p style="margin:0 0 12px;"><strong>' + lignes.length + '</strong> protocole(s) validé(s)'
    + (nbAlertes ? ', dont <strong style="color:#a61b1b;">' + nbAlertes + ' avec point(s) de vigilance</strong>' : '') + '.</p>'
    + '<table style="border-collapse:collapse;font-size:13px;">'
    + '<tr style="background:#000048;color:#fff;"><th style="padding:6px;">Heure</th><th style="padding:6px;">Entreprise livrée</th>'
    + '<th style="padding:6px;">Transporteur</th><th style="padding:6px;">Chauffeur</th><th style="padding:6px;">Immat.</th>'
    + '<th style="padding:6px;">Matières</th><th style="padding:6px;">Vigilance</th><th style="padding:6px;">PDF</th></tr>';
  lignes.forEach(function (v) {
    const alerte = v[idx.alertes];
    html += '<tr style="border-bottom:1px solid #ddd;' + (alerte ? 'background:#fff4e5;' : '') + '">'
      + '<td style="padding:6px;">' + esc(heure(v[idx.horodatage])) + '</td>'
      + '<td style="padding:6px;">' + esc(v[idx.entreprise_livree]) + '</td>'
      + '<td style="padding:6px;">' + esc(v[idx.transporteur]) + '</td>'
      + '<td style="padding:6px;">' + esc(v[idx.chauffeur]) + '</td>'
      + '<td style="padding:6px;">' + esc(v[idx.immatriculation]) + '</td>'
      + '<td style="padding:6px;">' + esc(v[idx.matieres]) + '</td>'
      + '<td style="padding:6px;color:#a61b1b;">' + esc(alerte) + '</td>'
      + '<td style="padding:6px;">' + (v[COL_PDF - 1] ? '<a href="' + esc(v[COL_PDF - 1]) + '">ouvrir</a>' : '') + '</td></tr>';
  });
  html += '</table><p style="color:#888;font-size:11px;">Résumé automatique – registre Google Sheets « '
    + esc(SpreadsheetApp.getActiveSpreadsheet().getName()) + ' ».</p></div>';

  MailApp.sendEmail({
    to: RESUME_A,
    subject: '📋 Livraisons du ' + aujourdhui + ' – ' + lignes.length + ' protocole(s)' + (nbAlertes ? ' (' + nbAlertes + ' ⚠️)' : ''),
    htmlBody: html,
    body: lignes.length + ' protocole(s) validé(s) le ' + aujourdhui + '. Détail dans le registre Google Sheets.',
    name: NOM_EXPEDITEUR,
  });
}

// ------------------------------------------------------------------ outils

function feuille_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ONGLET);
  if (!sh) {
    sh = ss.insertSheet(ONGLET);
    const entetes = COLONNES.map(([, titre]) => titre).concat(['PDF signé', 'E-mail envoyé par Gmail', 'ID formulaire']);
    // Tout en texte brut : évite que Google Sheets transforme les dates ou les numéros de téléphone
    sh.getRange(1, 1, sh.getMaxRows(), entetes.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold').setBackground('#000048').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function trouverLigne_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, COL_ID, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
  const i = ids.indexOf(String(id));
  return i === -1 ? 0 : i + 2;
}

function dossier_() {
  const it = DriveApp.getFoldersByName(DOSSIER_DRIVE);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DOSSIER_DRIVE);
}

// Empêche l'injection de formules dans le tableur (=, +, -, @ en début de cellule)
function nettoie_(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
