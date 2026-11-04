'use strict';
/**
 * Transforme l'« user-agent » du navigateur en description lisible
 * (ex. « Android 14 · Chrome 130 », « iPhone iOS 17.5 · Safari 17 »).
 * Sert de preuve complémentaire sur la page d'attestation et dans le registre.
 */
function decrireAppareil(ua) {
    const s = String(ua || '').slice(0, 400);
    if (!s) return 'Inconnu';
    let m;
    let os = '';
    if ((m = s.match(/Android ([\d.]+)/))) os = `Android ${m[1].split('.')[0]}`;
    else if ((m = s.match(/iPhone OS ([\d_]+)/))) os = `iPhone iOS ${m[1].replace(/_/g, '.')}`;
    else if ((m = s.match(/iPad.*OS ([\d_]+)/))) os = `iPad iOS ${m[1].replace(/_/g, '.')}`;
    else if (/Windows NT/.test(s)) os = 'Windows';
    else if (/Mac OS X/.test(s)) os = 'Mac';
    else if (/Linux/.test(s)) os = 'Linux';

    let nav = '';
    if ((m = s.match(/SamsungBrowser\/(\d+)/))) nav = `Samsung Internet ${m[1]}`;
    else if ((m = s.match(/EdgA?\/(\d+)/))) nav = `Edge ${m[1]}`;
    else if ((m = s.match(/CriOS\/(\d+)/))) nav = `Chrome ${m[1]}`;
    else if ((m = s.match(/(?:FxiOS|Firefox)\/(\d+)/))) nav = `Firefox ${m[1]}`;
    else if ((m = s.match(/Chrome\/(\d+)/))) nav = `Chrome ${m[1]}`;
    else if ((m = s.match(/Version\/(\d+(?:\.\d+)?).*Safari/))) nav = `Safari ${m[1]}`;

    const out = [os, nav].filter(Boolean).join(' · ');
    return out || s.replace(/[^\x20-\x7E]/g, '').slice(0, 80) || 'Inconnu';
}

module.exports = { decrireAppareil };
