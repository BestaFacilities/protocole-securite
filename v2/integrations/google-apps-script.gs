/**
 * REGISTRE DES PROTOCOLES – Google Sheets + archivage PDF dans Google Drive (FACULTATIF, GRATUIT)
 * ------------------------------------------------------------------------------------------------
 * Chaque protocole validé ajoute une ligne dans le tableur et range le PDF signé dans un dossier Drive.
 * L'e-mail Brevo reste la voie principale : si ce registre est en panne, le chauffeur est quand même validé.
 *
 * INSTALLATION (10 minutes, compte Google de bestafacilities) :
 *  1. Créer un Google Sheet vide nommé « Registre protocoles GARE ISSY ».
 *  2. Menu Extensions → Apps Script. Effacer le contenu et coller CE fichier.
 *  3. Remplacer SECRET ci-dessous par une phrase longue et aléatoire (la même que SHEETS_WEBHOOK_SECRET sur Render).
 *  4. Déployer → Nouveau déploiement → type « Application Web »
 *       - Exécuter en tant que : Moi
 *       - Qui a accès : Tout le monde
 *     Autoriser l'accès demandé (Sheets + Drive), puis copier l'URL qui se termine par /exec.
 *  5. Sur Render (Environment) :
 *       SHEETS_WEBHOOK_URL    = l'URL /exec
 *       SHEETS_WEBHOOK_SECRET = la même phrase que SECRET
 *  6. Faire un protocole de test : une ligne apparaît dans l'onglet « Protocoles » et le PDF dans Drive.
 *
 * Après une modification de ce script : Déployer → Gérer les déploiements → Modifier → Nouvelle version.
 */

const SECRET = 'REMPLACER-PAR-UNE-PHRASE-SECRETE-LONGUE';
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
  ['gps', 'Position GPS'],
  ['distance_chantier_m', 'Distance chantier (m)'],
  ['alertes', 'Points de vigilance'],
  ['langue', 'Langue'],
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data || data.secret !== SECRET) return json_({ ok: false, error: 'secret invalide' });
    const l = data.ligne || {};

    lock.waitLock(20000);
    const sheet = feuille_();

    // Anti-doublon : si la référence existe déjà, on ne l'ajoute pas une deuxième fois
    const refs = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat() : [];
    if (refs.indexOf(l.reference) !== -1) return json_({ ok: true, duplicate: true });

    let lienPdf = '';
    if (data.pdf && data.pdf.base64) {
      const blob = Utilities.newBlob(Utilities.base64Decode(data.pdf.base64), 'application/pdf', data.pdf.nom || (l.reference + '.pdf'));
      lienPdf = dossier_().createFile(blob).getUrl();
    }

    const ligne = COLONNES.map(([cle]) => nettoie_(l[cle]));
    ligne.push(lienPdf);
    sheet.appendRow(ligne);
    if (l.alertes) sheet.getRange(sheet.getLastRow(), 1, 1, ligne.length).setBackground('#fff4e5');
    return json_({ ok: true });
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

function feuille_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ONGLET);
  if (!sh) {
    sh = ss.insertSheet(ONGLET);
    const entetes = COLONNES.map(([, titre]) => titre).concat(['PDF signé']);
    sh.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold').setBackground('#000048').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
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
