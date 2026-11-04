'use strict';
/**
 * Lien avec le script Google Apps Script (voir integrations/google-apps-script.gs), activé
 * uniquement si SHEETS_WEBHOOK_URL est défini. Le script :
 *   - ajoute une ligne dans le registre Google Sheets et range le PDF dans Google Drive ;
 *   - si MAIL_VIA=gmail, envoie aussi l'e-mail du protocole depuis le compte Gmail ;
 *   - peut envoyer un e-mail d'alerte (plafond journalier).
 * Un échec du registre ne bloque jamais la validation du chauffeur.
 */
const { CHANTIER, CONFIG } = require('./config');

function construireLigne(d, r) {
    return {
        reference: r.ref,
        horodatage: r.horodatage,
        chantier: CHANTIER.nom,
        chauffeur: d.nom,
        telephone: d.telephone,
        transporteur: d.transporteur,
        fournisseur: d.fournisseur,
        entreprise_livree: d.entreprise,
        immatriculation: d.immatriculation,
        operation: r.libelles.operation,
        realisation: r.libelles.realisation,
        matieres: d.matieres,
        produits_dangereux: d.produits_dangereux === 'oui' ? r.libelles.dangers.join(', ') : 'Non',
        conditionnement: r.libelles.conditionnement.join(', '),
        poids: r.libelles.poids,
        dimensions: r.libelles.dimensions,
        vehicule: `${r.libelles.tonnage} – ${r.libelles.caracteristiques.join(', ')}`,
        hauteur_inf_4m2: d.hauteur_ok,
        longueur_inf_8m: d.longueur_ok,
        manutention: r.libelles.manutention.join(', '),
        distance_chantier_m: r.gps ? r.gps.distance : '',
        alertes: r.alertes.join(' | '),
        langue: r.libelles.langue,
        appareil: r.appareil,
        ip: r.ip,
        empreinte: r.empreinte,
        id_formulaire: d.id || r.ref,
    };
}

/** Appel brut du script. Renvoie la réponse JSON ({ ok, archived, mailed, … }) ou lève une erreur. */
async function appelAppsScript(contenu, timeoutMs = 25000) {
    if (!CONFIG.registreUrl) throw new Error('Registre non configuré');
    const res = await fetch(CONFIG.registreUrl, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret: CONFIG.registreSecret, ...contenu }),
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`);
    let json;
    try { json = JSON.parse(txt); } catch { throw new Error('Apps Script : réponse illisible (script mal déployé ?)'); }
    if (json.ok === false) throw new Error(`Apps Script : ${json.error || 'refusé'}`);
    return json;
}

/**
 * Archive le protocole (ligne + PDF). Si `mail` est fourni, demande aussi au script de l'envoyer par Gmail.
 * Renvoie { archived, mailed, mailError? }.
 */
async function enregistrer(d, r, pdfBuffer, mail = null, timeoutMs = 25000) {
    if (!CONFIG.registreUrl) return { skipped: true, archived: false, mailed: false };
    const contenu = {
        ligne: construireLigne(d, r),
        pdf: { nom: r.fichier, base64: pdfBuffer.toString('base64') },
    };
    if (mail) {
        contenu.mail = {
            to: CONFIG.destinataires.join(','),
            bcc: CONFIG.copieCachee.join(','),
            replyTo: CONFIG.repondreA,
            name: CONFIG.expediteur.nom,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
        };
    }
    const json = await appelAppsScript(contenu, timeoutMs);
    return {
        archived: json.archived !== false,
        mailed: json.mailed === true,
        mailError: json.mailError || '',
        duplicate: Boolean(json.duplicate),
    };
}

/**
 * Archivage en arrière-plan avec nouveaux essais (après 20 s puis 2 min) :
 * utilisé quand l'e-mail est parti par Brevo. N'empêche jamais la réponse au chauffeur.
 */
function enregistrerEnArrierePlan(d, r, pdfBuffer, delais = [20000, 120000]) {
    if (!CONFIG.registreUrl) return;
    const essai = (n) => {
        enregistrer(d, r, pdfBuffer)
            .then(() => console.log(`   registre OK – ${r.ref}${n ? ` (essai n°${n + 1})` : ''}`))
            .catch((e) => {
                if (n < delais.length) {
                    console.warn(`   registre KO – ${r.ref} : ${e.message} → nouvel essai dans ${delais[n] / 1000} s`);
                    setTimeout(() => essai(n + 1), delais[n]).unref();
                } else {
                    console.error(`   registre ABANDONNÉ – ${r.ref} : ${e.message} (le protocole est quand même dans l'e-mail)`);
                }
            });
    };
    essai(0);
}

/** E-mail d'alerte envoyé par le script (Gmail). */
async function alerteAppsScript(subject, text) {
    return appelAppsScript({ alerte: { to: CONFIG.destinataires.join(','), subject, text } }, 20000);
}

module.exports = { enregistrer, enregistrerEnArrierePlan, alerteAppsScript, construireLigne };
