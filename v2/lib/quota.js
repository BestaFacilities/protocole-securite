'use strict';
/**
 * Plafond journalier de protocoles (tous téléphones confondus) et alertes par e-mail.
 *
 * But : si quelqu'un envoie des centaines de faux protocoles, les quotas gratuits
 * (Gmail ≈ 100/jour, Brevo 300/jour) ne sont pas épuisés et vous êtes prévenu.
 * Le compteur est en mémoire : il repart de zéro chaque jour (heure de Paris)
 * et à chaque redémarrage / mise en veille du serveur Render.
 */
const { CONFIG } = require('./config');
const { sendAlerteBrevo } = require('./email');
const { alerteAppsScript } = require('./registre');

let jour = '';
let compte = 0;
const alertesEnvoyees = new Set();

function jourParis(now = new Date()) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: CONFIG.timezone, dateStyle: 'short' }).format(now);
}

function remiseAZero(now) {
    const j = jourParis(now);
    if (j !== jour) {
        jour = j;
        compte = 0;
        alertesEnvoyees.clear();
    }
}

/** Réserve une place pour un envoi. Renvoie false si le plafond du jour est atteint. */
function reserver(now = new Date()) {
    remiseAZero(now);
    if (compte >= CONFIG.plafondJour) {
        alerter('plafond', `🚫 Protocole ${jour} : plafond de ${CONFIG.plafondJour} envois atteint`,
            `Le plafond journalier de ${CONFIG.plafondJour} protocoles est atteint pour le ${jour}.\n`
            + 'Les nouveaux envois sont refusés jusqu\'à minuit : les chauffeurs voient un message les invitant à remplir le protocole papier au poste de garde.\n\n'
            + 'Si c\'est une journée normale très chargée : augmentez DAILY_MAX dans Render → Environment.\n'
            + 'Sinon, quelqu\'un envoie peut-être de faux protocoles : vérifiez les derniers e-mails / le registre.');
        return false;
    }
    compte += 1;
    if (compte === CONFIG.alerteJour) {
        alerter('seuil', `⚠️ Protocole ${jour} : déjà ${compte} envois aujourd'hui`,
            `${compte} protocoles ont été envoyés aujourd'hui (${jour}). C'est le seuil d'alerte (DAILY_ALERT).\n`
            + `Les envois seront bloqués à ${CONFIG.plafondJour} (DAILY_MAX).\n\n`
            + 'Si l\'activité est normale, rien à faire. Sinon, vérifiez les derniers e-mails / le registre.');
    }
    return true;
}

/** Rend la place si l'envoi a finalement échoué. */
function liberer() {
    if (compte > 0) compte -= 1;
}

/** Envoie une alerte une seule fois par jour et par type ; Gmail (Apps Script) d'abord, sinon Brevo. */
function alerter(type, subject, text) {
    if (alertesEnvoyees.has(type)) return;
    alertesEnvoyees.add(type);
    console.warn(`🔔 ALERTE : ${subject}`);
    (async () => {
        if (CONFIG.registreUrl) {
            try { await alerteAppsScript(subject, text); return; } catch (e) { console.warn('   alerte Gmail KO :', e.message); }
        }
        await sendAlerteBrevo(subject, text);
    })().catch((e) => console.error('   alerte non envoyée :', e.message));
}

function etat() {
    remiseAZero(new Date());
    return { jour, compte };
}

module.exports = { reserver, liberer, etat };
