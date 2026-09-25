'use strict';
/**
 * Registre optionnel : envoie chaque validation à un script Google Apps Script
 * qui ajoute une ligne dans un Google Sheet et archive le PDF dans Google Drive.
 * Activé uniquement si SHEETS_WEBHOOK_URL est défini (voir integrations/google-apps-script.gs).
 * Un échec du registre ne bloque jamais la validation du chauffeur (l'e-mail fait foi).
 */
const { CHANTIER, CONFIG } = require('./config');

async function enregistrer(d, r, pdfBuffer) {
    if (!CONFIG.registreUrl) return { skipped: true };

    const ligne = {
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
        gps: r.gps ? r.gps.texte : '',
        distance_chantier_m: r.gps ? r.gps.distance : '',
        alertes: r.alertes.join(' | '),
        langue: r.libelles.langue,
    };

    const res = await fetch(CONFIG.registreUrl, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            secret: CONFIG.registreSecret,
            ligne,
            pdf: { nom: r.fichier, base64: pdfBuffer.toString('base64') },
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Registre HTTP ${res.status}`);
    let json = {};
    try { json = JSON.parse(txt); } catch { /* réponse non JSON */ }
    if (json.ok === false) throw new Error(`Registre : ${json.error || 'refusé'}`);
    return json;
}

module.exports = { enregistrer };
