'use strict';
/**
 * Envoi du protocole validé : choisit le canal et gère le secours.
 *
 *   MAIL_VIA=gmail  → 1. le script Google (Apps Script) archive le PDF ET envoie l'e-mail depuis Gmail ;
 *                     2. si le script échoue ou si le quota Gmail est atteint → secours Brevo.
 *   MAIL_VIA=brevo  → e-mail par Brevo, puis archivage dans le registre en arrière-plan (s'il est configuré).
 */
const { CONFIG } = require('./config');
const { buildEmail, sendEmail } = require('./email');
const { enregistrer, enregistrerEnArrierePlan } = require('./registre');

async function envoyerProtocole(d, r, pdf) {
    const mail = buildEmail(d, r);
    let archived = false;

    if (CONFIG.envoiVia === 'gmail' && CONFIG.registreUrl) {
        try {
            const res = await enregistrer(d, r, pdf, mail, 45000);
            archived = res.archived;
            if (res.mailed) return { canal: 'gmail', archived, messageId: 'gmail' };
            console.warn(`   Gmail n'a pas envoyé l'e-mail (${res.mailError || 'raison inconnue'}) → secours Brevo`);
        } catch (e) {
            console.warn(`   Apps Script indisponible (${e.message}) → secours Brevo`);
        }
    }

    const res = await sendEmail(d, r, pdf, mail); // lève une erreur si Brevo échoue aussi
    if (!archived) enregistrerEnArrierePlan(d, r, pdf);
    return { canal: CONFIG.brevoApiKey ? 'brevo' : 'test', archived, messageId: res.messageId };
}

module.exports = { envoyerProtocole };
