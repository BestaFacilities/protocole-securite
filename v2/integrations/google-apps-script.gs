/**
 * REGISTRE DES PROTOCOLES + ENVOI DES E-MAILS PAR GMAIL (GRATUIT)
 * ------------------------------------------------------------------------------------------------
 * Ce script, installé dans un Google Sheet, fait 4 choses :
 *   1. chaque protocole validé ajoute une ligne dans l'onglet « Protocoles » et le PDF signé
 *      est rangé dans le dossier Google Drive « Protocoles de sécurité – GARE ISSY » ;
 *   2. si Render est réglé avec MAIL_VIA=gmail, il envoie aussi l'e-mail du protocole
 *      DEPUIS CE COMPTE GMAIL (bien mieux reçu par Outlook que Brevo avec une adresse @outlook.fr) ;
 *   3. il envoie les e-mails d'alerte du serveur (plafond journalier atteint…) ;
 *   4. chaque soir, il envoie un résumé des livraisons du jour (à activer une fois, voir étape 7) ;
 *      le vendredi soir, un résumé de la semaine, et le dernier jour du mois, un bilan du mois,
 *      tous deux avec le fichier Excel de la période en pièce jointe (le mensuel est aussi archivé dans Drive).
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
 *  7. Résumés : dans l'éditeur Apps Script, choisir la fonction « installerResumeQuotidien »
 *     dans la liste en haut, puis cliquer sur « Exécuter » (une seule fois). Résumé chaque jour vers 18 h,
 *     + résumé de la semaine le vendredi + bilan du mois le dernier jour du mois (même déclencheur).
 *     Pour tester tout de suite : exécuter « testerResumeSemaine » ou « testerResumeMois ».
 *  8. Faire un protocole de test : une ligne apparaît dans l'onglet « Protocoles », le PDF dans Drive,
 *     et l'e-mail arrive depuis l'adresse Gmail.
 *
 * Après une modification de ce script : Déployer → Gérer les déploiements → Modifier (crayon)
 * → Version : « Nouvelle version » → Déployer. (L'URL /exec reste la même.)
 */

const SECRET = 'REMPLACER-PAR-UNE-PHRASE-SECRETE-LONGUE';
const RESUME_A = 'bestafacilities@outlook.fr';   // destinataire(s) du résumé du soir, séparés par des virgules
const HEURE_RESUME = 18;                          // heure d'envoi des résumés (approximative, à ± 1 h près)
const JOUR_RESUME_SEMAINE = 5;                    // jour du résumé de la semaine : 5 = vendredi (1 = lundi … 7 = dimanche)
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

// ------------------------------------------------------------------ résumés (jour, semaine, mois)
//
// Un seul déclencheur (installé par installerResumeQuotidien) appelle resumeQuotidien() chaque jour vers HEURE_RESUME h.
// Ce même passage envoie aussi :
//   - le RÉSUMÉ DE LA SEMAINE le vendredi (du lundi au vendredi), avec le fichier Excel de la semaine en pièce jointe ;
//   - le RÉSUMÉ DU MOIS le dernier jour du mois, avec le fichier Excel du mois en pièce jointe,
//     également rangé dans Drive (dossier « Archives Excel » à l'intérieur de DOSSIER_DRIVE).
// Rien n'est envoyé pour une période sans aucun protocole.

/** À exécuter UNE fois à la main : programme l'envoi des résumés chaque jour vers HEURE_RESUME h. */
function installerResumeQuotidien() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'resumeQuotidien'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('resumeQuotidien').timeBased().everyDays(1).atHour(HEURE_RESUME).create();
}

/** Appelée chaque soir par le déclencheur : résumé du jour, + semaine le vendredi, + mois le dernier jour du mois. */
function resumeQuotidien() {
  const maintenant = new Date();
  const fuseau = Session.getScriptTimeZone();
  const jourSemaine = Number(Utilities.formatDate(maintenant, fuseau, 'u'));          // 1 = lundi … 7 = dimanche
  const demain = new Date(maintenant.getTime() + 24 * 3600 * 1000);
  const dernierJourDuMois = Utilities.formatDate(demain, fuseau, 'dd') === '01';

  // Chaque résumé est indépendant : une erreur sur l'un n'empêche pas l'envoi des autres.
  const erreurs = [];
  try { resumeDuJour_(maintenant); } catch (e) { erreurs.push('jour : ' + e); }
  if (jourSemaine === JOUR_RESUME_SEMAINE) { try { resumeDeLaSemaine_(maintenant); } catch (e) { erreurs.push('semaine : ' + e); } }
  if (dernierJourDuMois) { try { resumeDuMois_(maintenant); } catch (e) { erreurs.push('mois : ' + e); } }
  if (erreurs.length) throw new Error('Résumés en erreur – ' + erreurs.join(' / '));
}

/** Pour tester à la main depuis l'éditeur (bouton « Exécuter ») : envoie tout de suite le résumé de la semaine en cours. */
function testerResumeSemaine() { resumeDeLaSemaine_(new Date()); }

/** Pour tester à la main depuis l'éditeur : envoie tout de suite le résumé du mois en cours (jusqu'à aujourd'hui). */
function testerResumeMois() { resumeDuMois_(new Date()); }

/** Pour renvoyer le résumé d'un mois passé : modifier la date ci-dessous (n'importe quel jour du mois voulu), puis Exécuter. */
function renvoyerResumeMoisPasse() { resumeDuMois_(new Date(2026, 10, 15)); }   // 2026, 10, 15 = novembre 2026 (les mois commencent à 0)

// ---------- périodes

function resumeDuJour_(date) {
  const fuseau = Session.getScriptTimeZone();
  const cle = Utilities.formatDate(date, fuseau, 'yyyyMMdd');
  const libelle = Utilities.formatDate(date, fuseau, 'dd/MM/yyyy');
  const donnees = lireRegistre_();
  const lignes = donnees.lignes.filter(function (v) { return cleJour_(v, donnees) === cle; });
  if (!lignes.length) return;
  const nbAlertes = compterAlertes_(lignes, donnees);

  const html = enTete_('Livraisons du ' + libelle, lignes.length, nbAlertes, '')
    + tableauDetail_(lignes, donnees, false) + piedDePage_(false);

  envoyer_('📋 Livraisons du ' + libelle + ' – ' + lignes.length + ' protocole(s)' + (nbAlertes ? ' (' + nbAlertes + ' ⚠️)' : ''),
    html, lignes.length + ' protocole(s) validé(s) le ' + libelle + '. Détail dans le registre Google Sheets.', null);
}

function resumeDeLaSemaine_(date) {
  const fuseau = Session.getScriptTimeZone();
  const jour = Number(Utilities.formatDate(date, fuseau, 'u'));
  const lundi = new Date(date.getTime() - (jour - 1) * 24 * 3600 * 1000);
  const lundiPrec = new Date(lundi.getTime() - 7 * 24 * 3600 * 1000);
  const debut = Utilities.formatDate(lundi, fuseau, 'yyyyMMdd');
  const fin = Utilities.formatDate(date, fuseau, 'yyyyMMdd');
  const debutPrec = Utilities.formatDate(lundiPrec, fuseau, 'yyyyMMdd');
  const numero = Utilities.formatDate(date, fuseau, 'w');
  const du = Utilities.formatDate(lundi, fuseau, 'dd/MM');
  const au = Utilities.formatDate(date, fuseau, 'dd/MM/yyyy');

  const donnees = lireRegistre_();
  const lignes = donnees.lignes.filter(function (v) { const k = cleJour_(v, donnees); return k >= debut && k <= fin; });
  if (!lignes.length) return;
  const nbPrec = donnees.lignes.filter(function (v) { const k = cleJour_(v, donnees); return k >= debutPrec && k < debut; }).length;
  const nbAlertes = compterAlertes_(lignes, donnees);
  const titre = 'Semaine ' + numero + ' – livraisons du ' + du + ' au ' + au;

  const html = enTete_(titre, lignes.length, nbAlertes, comparaison_(lignes.length, nbPrec, 'la semaine précédente'))
    + tableauComptage_('Par jour', compterParJour_(lignes, donnees, true))
    + tableauComptage_('Par entreprise livrée', compterPar_(lignes, donnees.idx.entreprise_livree))
    + tableauComptage_('Par transporteur', compterPar_(lignes, donnees.idx.transporteur))
    + tableauDetail_(lignes, donnees, true)
    + piedDePage_(true);

  const nomFichier = 'Protocoles GARE ISSY – semaine ' + numero + ' (' + Utilities.formatDate(lundi, fuseau, 'dd-MM') + ' au ' + Utilities.formatDate(date, fuseau, 'dd-MM-yyyy') + ')';
  const excel = fichierExcel_(nomFichier, lignes, donnees, false);
  envoyer_('📊 ' + titre + ' – ' + lignes.length + ' protocole(s)' + (nbAlertes ? ' (' + nbAlertes + ' ⚠️)' : ''),
    html, lignes.length + ' protocole(s) validé(s) du ' + du + ' au ' + au + '.', excel);
}

function resumeDuMois_(date) {
  const fuseau = Session.getScriptTimeZone();
  const cleMois = Utilities.formatDate(date, fuseau, 'yyyyMM');
  const premier = new Date(Number(cleMois.substr(0, 4)), Number(cleMois.substr(4, 2)) - 1, 1, 12);
  const clePrec = Utilities.formatDate(new Date(premier.getTime() - 5 * 24 * 3600 * 1000), fuseau, 'yyyyMM');
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const nomMois = MOIS[Number(cleMois.substr(4, 2)) - 1] + ' ' + cleMois.substr(0, 4);

  const donnees = lireRegistre_();
  const lignes = donnees.lignes.filter(function (v) { return cleJour_(v, donnees).substr(0, 6) === cleMois; });
  if (!lignes.length) return;
  const nbPrec = donnees.lignes.filter(function (v) { return cleJour_(v, donnees).substr(0, 6) === clePrec; }).length;
  const nbAlertes = compterAlertes_(lignes, donnees);
  const joursAvecLivraison = Object.keys(compterParJour_(lignes, donnees, false)).length;
  const titre = 'Bilan du mois – ' + nomMois;
  const moyenne = '<p style="margin:0 0 12px;">' + joursAvecLivraison + ' jour(s) avec livraison, soit <strong>'
    + (Math.round(lignes.length / joursAvecLivraison * 10) / 10).toString().replace('.', ',') + '</strong> protocole(s) par jour en moyenne.</p>';

  const alertes = lignes.filter(function (v) { return v[donnees.idx.alertes]; });
  const html = enTete_(titre, lignes.length, nbAlertes, comparaison_(lignes.length, nbPrec, 'le mois précédent'))
    + moyenne
    + tableauComptage_('Par semaine', compterParSemaine_(lignes, donnees))
    + tableauComptage_('Par entreprise livrée', compterPar_(lignes, donnees.idx.entreprise_livree))
    + tableauComptage_('Par transporteur (10 premiers)', compterPar_(lignes, donnees.idx.transporteur), 10)
    + (alertes.length ? '<h3 style="color:#a61b1b;margin:18px 0 6px;">Protocoles avec point(s) de vigilance</h3>' + tableauDetail_(alertes, donnees, true, true) : '')
    + '<p style="margin:14px 0 0;">La liste complète des ' + lignes.length + ' protocoles est dans le fichier Excel joint.</p>'
    + piedDePage_(true);

  const excel = fichierExcel_('Protocoles GARE ISSY – ' + nomMois, lignes, donnees, true);
  envoyer_('🗂️ ' + titre + ' – ' + lignes.length + ' protocole(s)' + (nbAlertes ? ' (' + nbAlertes + ' ⚠️)' : ''),
    html, lignes.length + ' protocole(s) validé(s) en ' + nomMois + '. Fichier Excel joint.', excel);
}

// ---------- lecture du registre

function lireRegistre_() {
  const sheet = feuille_();
  const idx = {};
  COLONNES.forEach(function (c, i) { idx[c[0]] = i; });
  const lignes = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, COL_ID).getValues();
  return { idx: idx, lignes: lignes, fuseau: Session.getScriptTimeZone() };
}

/** Date du protocole sous la forme 20261124 (l'horodatage est enregistré en texte « 24/11/2026 12:24:05 »). */
function cleJour_(v, donnees) {
  const h = v[donnees.idx.horodatage];
  if (h instanceof Date) return Utilities.formatDate(h, donnees.fuseau, 'yyyyMMdd');
  const m = String(h).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2) : '';
}

function compterAlertes_(lignes, donnees) {
  return lignes.filter(function (v) { return v[donnees.idx.alertes]; }).length;
}

/** Regroupe sans tenir compte des majuscules ni des espaces (« Demathieu bard » = « DEMATHIEU BARD »). */
function compterPar_(lignes, col) {
  const groupes = {};
  lignes.forEach(function (v) {
    const brut = String(v[col] || '').trim().replace(/\s+/g, ' ') || '(non renseigné)';
    const cle = brut.toLowerCase();
    if (!groupes[cle]) groupes[cle] = { libelle: brut, n: 0 };
    groupes[cle].n++;
  });
  const res = {};
  Object.keys(groupes).sort(function (a, b) { return groupes[b].n - groupes[a].n; })
    .forEach(function (k) { res[groupes[k].libelle] = groupes[k].n; });
  return res;
}

function compterParJour_(lignes, donnees, avecNomDuJour) {
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const res = {};
  lignes.map(function (v) { return cleJour_(v, donnees); }).sort().forEach(function (k) {
    const d = new Date(Number(k.substr(0, 4)), Number(k.substr(4, 2)) - 1, Number(k.substr(6, 2)), 12);
    const libelle = (avecNomDuJour ? JOURS[d.getDay()] + ' ' : '') + k.substr(6, 2) + '/' + k.substr(4, 2);
    res[libelle] = (res[libelle] || 0) + 1;
  });
  return res;
}

function compterParSemaine_(lignes, donnees) {
  const res = {};
  lignes.map(function (v) { return cleJour_(v, donnees); }).sort().forEach(function (k) {
    const d = new Date(Number(k.substr(0, 4)), Number(k.substr(4, 2)) - 1, Number(k.substr(6, 2)), 12);
    const libelle = 'Semaine ' + Utilities.formatDate(d, donnees.fuseau, 'w');
    res[libelle] = (res[libelle] || 0) + 1;
  });
  return res;
}

// ---------- mise en forme des e-mails

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function comparaison_(n, nPrec, periode) {
  if (!nPrec) return '';
  const ecart = n - nPrec;
  const pct = Math.round(Math.abs(ecart) / nPrec * 100);
  const texte = ecart === 0 ? 'autant que ' + periode + ' (' + nPrec + ')'
    : (ecart > 0 ? '+' : '−') + Math.abs(ecart) + ' (' + (ecart > 0 ? '+' : '−') + pct + ' %) par rapport à ' + periode + ' (' + nPrec + ')';
  return '<p style="margin:0 0 12px;color:#555;">' + texte + '.</p>';
}

function enTete_(titre, n, nbAlertes, complement) {
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">'
    + '<h2 style="color:#000048;margin:0 0 6px;">' + esc_(titre) + '</h2>'
    + '<p style="margin:0 0 6px;"><strong>' + n + '</strong> protocole(s) validé(s)'
    + (nbAlertes ? ', dont <strong style="color:#a61b1b;">' + nbAlertes + ' avec point(s) de vigilance</strong>' : '') + '.</p>'
    + complement;
}

function tableauComptage_(titre, compte, max) {
  const cles = Object.keys(compte);
  if (!cles.length) return '';
  const affichees = max ? cles.slice(0, max) : cles;
  let html = '<h3 style="color:#000048;margin:18px 0 6px;">' + esc_(titre) + '</h3>'
    + '<table style="border-collapse:collapse;font-size:13px;">';
  affichees.forEach(function (k) {
    html += '<tr style="border-bottom:1px solid #ddd;"><td style="padding:4px 14px 4px 6px;">' + esc_(k) + '</td>'
      + '<td style="padding:4px 6px;text-align:right;"><strong>' + compte[k] + '</strong></td></tr>';
  });
  if (max && cles.length > max) {
    const reste = cles.slice(max).reduce(function (s, k) { return s + compte[k]; }, 0);
    html += '<tr><td style="padding:4px 14px 4px 6px;color:#888;">Autres (' + (cles.length - max) + ')</td><td style="padding:4px 6px;text-align:right;color:#888;">' + reste + '</td></tr>';
  }
  return html + '</table>';
}

function tableauDetail_(lignes, donnees, avecDate, sansTitre) {
  const idx = donnees.idx;
  const heure = function (h) {
    if (h instanceof Date) return Utilities.formatDate(h, donnees.fuseau, avecDate ? 'dd/MM HH:mm' : 'HH:mm');
    const s = String(h);
    return avecDate ? s.substr(0, 5) + ' ' + s.substr(11, 5) : s.substr(11, 5);
  };
  let html = (avecDate && !sansTitre ? '<h3 style="color:#000048;margin:18px 0 6px;">Détail</h3>' : '')
    + '<table style="border-collapse:collapse;font-size:13px;">'
    + '<tr style="background:#000048;color:#fff;"><th style="padding:6px;">' + (avecDate ? 'Date' : 'Heure') + '</th><th style="padding:6px;">Entreprise livrée</th>'
    + '<th style="padding:6px;">Transporteur</th><th style="padding:6px;">Chauffeur</th><th style="padding:6px;">Immat.</th>'
    + '<th style="padding:6px;">Matières</th><th style="padding:6px;">Vigilance</th><th style="padding:6px;">PDF</th></tr>';
  lignes.forEach(function (v) {
    const alerte = v[idx.alertes];
    html += '<tr style="border-bottom:1px solid #ddd;' + (alerte ? 'background:#fff4e5;' : '') + '">'
      + '<td style="padding:6px;white-space:nowrap;">' + esc_(heure(v[idx.horodatage])) + '</td>'
      + '<td style="padding:6px;">' + esc_(v[idx.entreprise_livree]) + '</td>'
      + '<td style="padding:6px;">' + esc_(v[idx.transporteur]) + '</td>'
      + '<td style="padding:6px;">' + esc_(v[idx.chauffeur]) + '</td>'
      + '<td style="padding:6px;">' + esc_(v[idx.immatriculation]) + '</td>'
      + '<td style="padding:6px;">' + esc_(v[idx.matieres]) + '</td>'
      + '<td style="padding:6px;color:#a61b1b;">' + esc_(alerte) + '</td>'
      + '<td style="padding:6px;">' + (v[COL_PDF - 1] ? '<a href="' + esc_(v[COL_PDF - 1]) + '">ouvrir</a>' : '') + '</td></tr>';
  });
  return html + '</table>';
}

function piedDePage_(avecExcel) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return '<p style="color:#888;font-size:11px;margin-top:14px;">Résumé automatique – registre Google Sheets « '
    + '<a href="' + esc_(ss.getUrl()) + '" style="color:#888;">' + esc_(ss.getName()) + '</a> »'
    + (avecExcel ? ' – fichier Excel joint.' : '.') + '</p></div>';
}

function envoyer_(sujet, html, texte, pieceJointe) {
  const options = { to: RESUME_A, subject: sujet, htmlBody: html, body: texte, name: NOM_EXPEDITEUR };
  if (pieceJointe) options.attachments = [pieceJointe];
  MailApp.sendEmail(options);
}

// ---------- fichier Excel (.xlsx)

/**
 * Crée le fichier Excel de la période (une ligne par protocole) et le renvoie pour la pièce jointe.
 * Si archiver = true, une copie .xlsx est rangée dans Drive (dossier « Archives Excel »).
 * En cas de problème, renvoie null : l'e-mail part quand même, sans pièce jointe.
 */
function fichierExcel_(nom, lignes, donnees, archiver) {
  let temporaire = null;
  try {
    temporaire = SpreadsheetApp.create(nom);
    const sh = temporaire.getSheets()[0];
    sh.setName('Protocoles');
    const entetes = COLONNES.map(function (c) { return c[1]; }).concat(['PDF signé']);
    const valeurs = lignes.map(function (v) {
      return COLONNES.map(function (c, i) {
        const x = v[i];
        return x instanceof Date ? Utilities.formatDate(x, donnees.fuseau, 'dd/MM/yyyy HH:mm:ss') : nettoie_(x);
      }).concat([nettoie_(v[COL_PDF - 1])]);
    });
    const plage = sh.getRange(1, 1, valeurs.length + 1, entetes.length);
    plage.setNumberFormat('@').setValues([entetes].concat(valeurs)).setVerticalAlignment('top');
    sh.getRange(1, 1, 1, entetes.length).setFontWeight('bold').setBackground('#000048').setFontColor('#ffffff');
    lignes.forEach(function (v, i) {
      if (v[donnees.idx.alertes]) sh.getRange(i + 2, 1, 1, entetes.length).setBackground('#fff4e5');
    });
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, entetes.length, 150);
    SpreadsheetApp.flush();

    const reponse = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + temporaire.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (reponse.getResponseCode() !== 200) throw new Error('export Excel HTTP ' + reponse.getResponseCode());
    const blob = reponse.getBlob().setName(nom + '.xlsx');
    if (archiver) archivesExcel_().createFile(blob.copyBlob().setName(nom + '.xlsx'));
    return blob;
  } catch (e) {
    console.error('Fichier Excel non créé : ' + e);
    return null;
  } finally {
    if (temporaire) { try { DriveApp.getFileById(temporaire.getId()).setTrashed(true); } catch (e2) { /* rien */ } }
  }
}

function archivesExcel_() {
  const parent = dossier_();
  const it = parent.getFoldersByName('Archives Excel');
  return it.hasNext() ? it.next() : parent.createFolder('Archives Excel');
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
