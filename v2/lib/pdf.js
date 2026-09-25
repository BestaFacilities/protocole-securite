'use strict';
/**
 * Remplit le PDF officiel « DB-PRE-F-V2022-09 Protocole Sécurité Chargement/Déchargement »
 * avec les informations saisies par le chauffeur, puis ajoute une page d'attestation.
 *
 * Le PDF d'origine n'a pas de champs de formulaire : on écrit donc directement sur
 * la page aux coordonnées relevées dans le document (voir tools/prepare-assets.py).
 * Coordonnées exprimées en points PDF depuis le HAUT de la page (comme un lecteur PDF),
 * converties en interne vers le repère pdf-lib (origine en bas).
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { CHANTIER } = require('./config');

const INK = rgb(0.03, 0.2, 0.62);       // « stylo bleu » pour les informations remplies
const NAVY = rgb(0, 0, 72 / 255);        // bleu Demathieu Bard
const ORANGE = rgb(235 / 255, 102 / 255, 8 / 255);
const GREY = rgb(0.42, 0.42, 0.42);
const RED = rgb(0.75, 0.1, 0.1);
const GREEN = rgb(0.05, 0.5, 0.2);
const LIGHT = rgb(0.96, 0.96, 0.97);

// ------------------------------------------------------------------ positions des cases ☐
const CB = {
    p1: {
        chargement: [48.0, 313.8], dechargement: [48.0, 330.6],
        accueil: [182.4, 313.8], transporteur: [182.4, 330.6],
        ponctuelle: [366.6, 313.8],
        ghs: {
            explosif: [48.0, 562.3], inflammable: [105.0, 562.3], comburant: [161.5, 562.3],
            gaz: [217.9, 562.3], nocif: [274.3, 562.3], corrosif: [330.8, 562.3],
            toxique: [387.8, 562.3], sante: [444.5, 562.3], environnement: [501.0, 562.3],
        },
        cond: {
            colis: [72.7, 646.9], palette: [155.6, 646.9], panier: [272.4, 646.9], rack: [374.5, 646.9],
            caisse_palette: [462.8, 646.9], autre: [444.8, 670.4], big_bag: [68.8, 695.5],
            bidon: [170.5, 695.5], benne: [272.5, 695.5], container: [364.2, 695.5],
        },
    },
    p2: {
        moins_3t5: [48.8, 107.8], plus_3t5: [177.1, 107.8], hauteur: [295.1, 107.8], longueur: [425.3, 107.8],
        car: {
            articule: [66.4, 202.0], toupie: [214.0, 202.0], citerne: [340.0, 202.0], benne: [470.3, 202.0],
            autre: [448.1, 229.9], plateau: [86.4, 271.8], bache_sol: [190.9, 271.8], porte_engin: [332.4, 271.8],
        },
        site: {
            quai: [49.2, 365.0], pir: [177.8, 365.0], grue_tour: [275.3, 365.0], grue_mobile: [373.1, 365.0],
            pont_roulant: [472.7, 365.0], accessoires_levage: [51.2, 430.9], chariot: [165.4, 430.9],
            transpalette: [274.3, 430.9], diable: [385.2, 430.9],
        },
        man: {
            grue_aux: [48.0, 524.0], hayon: [133.8, 524.0], benne_basc: [225.1, 524.0],
            transpalette: [317.3, 524.0], diable: [395.3, 524.0], elingues: [459.0, 524.0],
        },
    },
    p4: { 10: [77.4, 101.9], 20: [126.5, 101.9], 30: [175.6, 101.9] },
};

let cache = null;
function loadAssets() {
    if (!cache) {
        cache = {
            modele: fs.readFileSync(CHANTIER.pdfModele),
            logo: fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-demathieu-bard.png')),
        };
    }
    return cache;
}

/** Remplace les caractères non imprimables avec les polices standard PDF (ex. ł, ș, emojis). */
function makeSafe(font) {
    return (text) => {
        const out = [];
        for (const ch of String(text ?? '')) {
            try { font.encodeText(ch); out.push(ch); continue; } catch { /* non supporté */ }
            const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const map = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ß': 'ss', 'ø': 'o', 'Ø': 'O', '’': "'", '–': '-', '—': '-' };
            let rep = map[ch] || base;
            try { font.encodeText(rep); } catch { rep = /\s/.test(ch) ? ' ' : ''; }
            out.push(rep);
        }
        return out.join('');
    };
}

async function buildPdf(d, r) {
    const { modele, logo } = loadAssets();
    const pdf = await PDFDocument.load(modele);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const safe = makeSafe(font);
    const pages = pdf.getPages();
    const H = pages[0].getHeight();

    // ---------------------------------------------------------------- utilitaires de dessin
    const fit = (text, f, size, maxWidth, minSize = 6) => {
        let s = size;
        const t = safe(text);
        while (s > minSize && f.widthOfTextAtSize(t, s) > maxWidth) s -= 0.25;
        let out = t;
        if (f.widthOfTextAtSize(out, s) > maxWidth) {
            while (out.length > 1 && f.widthOfTextAtSize(out + '…', s) > maxWidth) out = out.slice(0, -1);
            out += '…';
        }
        return { text: out, size: s };
    };

    const write = (page, text, x, baseline, opts = {}) => {
        const f = opts.font || font;
        const size = opts.size || 10;
        const { text: t, size: s } = opts.maxWidth ? fit(text, f, size, opts.maxWidth, opts.minSize) : { text: safe(text), size };
        let px = x;
        if (opts.align === 'center') px = x - f.widthOfTextAtSize(t, s) / 2;
        if (opts.align === 'right') px = x - f.widthOfTextAtSize(t, s);
        page.drawText(t, { x: px, y: H - baseline, size: s, font: f, color: opts.color || INK });
        return s;
    };

    const wrap = (text, f, size, maxWidth) => {
        const words = safe(text).split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (f.widthOfTextAtSize(test, size) <= maxWidth) line = test;
            else { if (line) lines.push(line); line = w; }
        }
        if (line) lines.push(line);
        return lines;
    };

    /** Écrit un texte multiligne dans une zone ; réduit la taille si nécessaire. */
    const writeBox = (page, text, x, top, width, height, opts = {}) => {
        const f = opts.font || font;
        let size = opts.size || 10;
        let lines;
        for (;;) {
            lines = wrap(text, f, size, width);
            const needed = lines.length * size * 1.18;
            if (needed <= height || size <= (opts.minSize || 6.5)) break;
            size -= 0.25;
        }
        const lh = size * 1.18;
        const maxLines = Math.max(1, Math.floor(height / lh));
        if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '…'; }
        lines.forEach((l, i) => {
            page.drawText(l, { x, y: H - (top + size + i * lh), size, font: f, color: opts.color || INK });
        });
    };

    const check = (page, pos, size = 9.5) => {
        if (!pos) return;
        const [x0, top] = pos;
        const pad = size * 0.2;
        const x1 = x0 + pad, x2 = x0 + size - pad * 0.6;
        const y1 = H - (top + pad * 1.1), y2 = H - (top + size - pad * 0.4);
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.4, color: INK });
        page.drawLine({ start: { x: x1, y: y2 }, end: { x: x2, y: y1 }, thickness: 1.4, color: INK });
    };

    const cover = (page, x, top, w, h, color = rgb(1, 1, 1)) => {
        page.drawRectangle({ x, y: H - top - h, width: w, height: h, color });
    };

    const tampon = `Réf. ${r.ref}  ·  Protocole rempli et signé électroniquement le ${r.date} à ${r.heure}`;

    // ================================================================ PAGE 1
    const p1 = pages[0];
    write(p1, tampon, 552, 16, { size: 7, color: GREY, align: 'right', font });

    // Transporteur / fournisseur
    write(p1, d.transporteur, 392, 206.3, { maxWidth: 160, size: 10, minSize: 7 });
    const adresseTexte = [d.fournisseur ? `Fournisseur : ${d.fournisseur}.` : '', d.adresse].filter(Boolean).join(' ');
    if (adresseTexte) writeBox(p1, adresseTexte, 392, 212.5, 160, 34, { size: 10 });
    write(p1, `${d.nom} (chauffeur)`, 392, 262.8, { maxWidth: 160 });
    write(p1, d.telephone, 392, 282.1, { maxWidth: 160 });

    // Nature de l'opération
    if (d.operation === 'chargement' || d.operation === 'les_deux') check(p1, CB.p1.chargement, 10);
    if (d.operation === 'dechargement' || d.operation === 'les_deux') check(p1, CB.p1.dechargement, 10);
    check(p1, CB.p1[d.realisation], 10);
    check(p1, CB.p1.ponctuelle, 10);

    // Date et horaire de livraison (heure du serveur, fuseau de Paris)
    cover(p1, 388, 377, 58, 13);
    write(p1, `${r.parts.day}/${r.parts.month}/${r.parts.year}`, 390, 387.2, { font: bold, size: 11 });
    cover(p1, 383, 402, 40, 13);
    write(p1, `${r.parts.hour} h ${r.parts.minute}`, 385, 412.2, { font: bold, size: 11 });

    // Matières transportées : une ligne par zone grise (2 zones), texte réduit si nécessaire
    {
        let size = 10.5;
        let lines = wrap(d.matieres, font, size, 498);
        while (lines.length > 2 && size > 7.5) { size -= 0.25; lines = wrap(d.matieres, font, size, 498); }
        if (lines.length <= 2) {
            lines.forEach((l, i) => write(p1, l, 47, 492.9 + i * 21.9, { size }));
        } else {
            // très long texte : 2 lignes par zone grise
            size = 7;
            lines = wrap(d.matieres, font, size, 498);
            if (lines.length > 4) { lines = lines.slice(0, 4); lines[3] += '…'; }
            lines.forEach((l, i) => write(p1, l, 47, 488.6 + (i % 2) * 8 + Math.floor(i / 2) * 21.9, { size }));
        }
    }

    // Pictogrammes de danger
    d.dangers.forEach((c) => check(p1, CB.p1.ghs[c]));

    // Conditionnement
    d.conditionnement.forEach((c) => check(p1, CB.p1.cond[c]));
    if (d.conditionnement_autre) {
        check(p1, CB.p1.cond.autre);
        write(p1, d.conditionnement_autre, 446, 696, { maxWidth: 103, size: 9 });
    }

    // Poids et dimensions de l'élément le plus défavorable
    const num = (v) => (v === null ? '' : String(v).replace('.', ','));
    if (d.poids_kg !== null) write(p1, num(d.poids_kg), 168.4, 755.2, { align: 'center', maxWidth: 58, size: 10.5 });
    [[d.dim_longueur, 363.9], [d.dim_largeur, 420.6], [d.dim_hauteur, 477.1]].forEach(([v, cx]) => {
        if (v !== null) write(p1, num(v), cx, 755.2, { align: 'center', maxWidth: 30, size: 10 });
    });

    // ================================================================ PAGE 2
    const p2 = pages[1];
    write(p2, tampon, 552, 18, { size: 7, color: GREY, align: 'right' });
    check(p2, CB.p2[d.tonnage]);
    if (d.hauteur_ok === 'oui') check(p2, CB.p2.hauteur);
    else write(p2, 'NON : 4,2 m ou plus', 305, 125.4, { size: 6.5, color: RED, font: bold });
    if (d.longueur_ok === 'oui') check(p2, CB.p2.longueur);
    else write(p2, 'NON : 8 m ou plus', 435, 125.4, { size: 6.5, color: RED, font: bold });

    d.caracteristiques.forEach((c) => (c === 'fourgon' ? null : check(p2, CB.p2.car[c])));
    const autresVehicule = [];
    if (d.caracteristiques.includes('fourgon')) autresVehicule.push('Fourgon / utilitaire');
    if (d.caracteristique_autre) autresVehicule.push(d.caracteristique_autre);
    if (autresVehicule.length) {
        check(p2, CB.p2.car.autre);
        writeBox(p2, autresVehicule.join(', '), 432, 250, 110, 26, { size: 9 });
    }
    (CHANTIER.equipementsSite || []).forEach((c) => check(p2, CB.p2.site[c]));
    d.manutention.forEach((c) => check(p2, CB.p2.man[c]));

    // Signature transporteur / fournisseur
    write(p2, d.nom, 362, 737.6, { maxWidth: 188 });
    write(p2, `${d.fonction} – ${d.transporteur}`, 362, 754.6, { maxWidth: 188 });
    write(p2, `${r.date} à ${r.heure}`, 362, 771.6, { maxWidth: 188 });
    const sig = await pdf.embedPng(d.signature);
    const sigBox = { x: 362, top: 773, w: 185, h: 38 };
    const scale = Math.min(sigBox.w / sig.width, sigBox.h / sig.height);
    p2.drawImage(sig, { x: sigBox.x, y: H - sigBox.top - sig.height * scale, width: sig.width * scale, height: sig.height * scale });

    // ================================================================ PAGE 3
    const p3 = pages[2];
    write(p3, tampon, 552, 18, { size: 7, color: GREY, align: 'right' });
    cover(p3, 200, 60, 196, 19, rgb(191 / 255, 191 / 255, 191 / 255));
    write(p3, CHANTIER.nomComplet, 297.6, 73.6, { align: 'center', font: bold, size: 11, maxWidth: 300, color: NAVY });
    CHANTIER.adresse.forEach((line, i) => write(p3, line, 172.5, 244 + i * 13, { align: 'center', maxWidth: 240 }));
    write(p3, CHANTIER.contact.nom, 348, 244.8, { maxWidth: 200 });
    write(p3, CHANTIER.contact.tel, 348, 268.8, { maxWidth: 200 });
    if (CHANTIER.contact.email) write(p3, CHANTIER.contact.email, 348, 292.9, { maxWidth: 200 });

    // ================================================================ PAGE 4
    const p4 = pages[3];
    write(p4, tampon, 552, 18, { size: 7, color: GREY, align: 'right' });
    if (CHANTIER.vitesseMax) check(p4, CB.p4[CHANTIER.vitesseMax]);

    // ================================================================ PAGE 5 : attestation
    await addAttestation(pdf, { d, r, font, bold, safe, write, writeBox, wrap, logo, sig });

    pdf.setTitle(`Protocole de sécurité – ${CHANTIER.nom} – ${d.nom} – ${r.date}`);
    pdf.setSubject(`Réf. ${r.ref}`);
    pdf.setAuthor(d.nom);
    pdf.setCreator('Protocole sécurité – validation par QR code');
    pdf.setProducer('pdf-lib');
    pdf.setCreationDate(new Date(r.iso));
    pdf.setModificationDate(new Date(r.iso));

    return Buffer.from(await pdf.save({ useObjectStreams: true }));
}

async function addAttestation(pdf, ctx) {
    const { d, r, font, bold, safe, write, wrap, logo, sig } = ctx;
    const page = pdf.addPage([595.32, 841.92]);
    const H = page.getHeight();
    const M = 42.7, W = 552 - 42.7;

    const logoImg = await pdf.embedPng(logo);
    const lh = 42, lw = (logoImg.width / logoImg.height) * lh;
    page.drawImage(logoImg, { x: M, y: H - 24 - lh, width: lw, height: lh });
    write(page, 'ATTESTATION DE VALIDATION', 552, 44, { align: 'right', font: bold, size: 16, color: NAVY });
    write(page, 'Protocole de sécurité – Chargement / Déchargement', 552, 61, { align: 'right', font: bold, size: 11.5, color: ORANGE });
    write(page, `Annexe au document ${CHANTIER.referenceDocument} – validation électronique par QR code`, 552, 75, { align: 'right', size: 8.5, color: GREY });

    let y = 92;
    // Bandeau de référence
    page.drawRectangle({ x: M, y: H - y - 34, width: W, height: 34, color: LIGHT, borderColor: NAVY, borderWidth: 0.8 });
    write(page, 'Référence', M + 10, y + 13, { size: 8, color: GREY });
    write(page, r.ref, M + 10, y + 27, { font: bold, size: 12, color: NAVY });
    write(page, 'Horodatage (heure de Paris)', M + 200, y + 13, { size: 8, color: GREY });
    write(page, r.horodatage, M + 200, y + 27, { font: bold, size: 12, color: NAVY });
    write(page, 'Chantier', M + 365, y + 13, { size: 8, color: GREY });
    write(page, CHANTIER.nom, M + 365, y + 27, { font: bold, size: 12, color: NAVY, maxWidth: 135 });
    y += 46;

    const section = (title) => {
        page.drawRectangle({ x: M, y: H - y - 16, width: W, height: 16, color: ORANGE });
        write(page, title, 297.6, y + 11.8, { align: 'center', font: bold, size: 10, color: rgb(1, 1, 1) });
        y += 22;
    };
    const row = (label, value, opts = {}) => {
        const lines = wrap(value || '–', opts.bold ? bold : font, 9.5, W - 150);
        write(page, label, M + 6, y + 9, { font: bold, size: 9, color: NAVY });
        lines.slice(0, 3).forEach((l, i) => write(page, l, M + 150, y + 9 + i * 11.5, { size: 9.5, font: opts.bold ? bold : font, color: opts.color || INK }));
        y += Math.max(1, Math.min(3, lines.length)) * 11.5 + 2.5;
    };

    section('IDENTIFICATION');
    row('Chauffeur', `${d.nom} – ${d.fonction}`);
    row('Téléphone', d.telephone);
    row('Transporteur', d.transporteur);
    if (d.fournisseur) row('Fournisseur', d.fournisseur);
    if (d.adresse) row('Adresse transporteur', d.adresse);
    row('Entreprise livrée', d.entreprise, { bold: true });
    row('Immatriculation', d.immatriculation);
    y += 4;

    section('VÉHICULE ET OPÉRATION');
    row('Opération', `${r.libelles.operation} – ${r.libelles.realisation}`);
    row('Type de véhicule', r.libelles.tonnage);
    row('Hauteur < 4,2 m', d.hauteur_ok === 'oui' ? 'Oui' : 'NON (4,2 m ou plus)', { color: d.hauteur_ok === 'oui' ? INK : RED });
    row('Longueur < 8 m', d.longueur_ok === 'oui' ? 'Oui' : 'NON (8 m ou plus)', { color: d.longueur_ok === 'oui' ? INK : RED });
    row('Caractéristiques', r.libelles.caracteristiques.join(', '));
    row('Moyens de manutention', r.libelles.manutention.join(', ') || 'Aucun déclaré');
    y += 4;

    section('MARCHANDISE');
    row('Matières transportées', d.matieres, { bold: true });
    row('Produits dangereux', d.produits_dangereux === 'oui' ? r.libelles.dangers.join(', ') : 'Non', { color: d.produits_dangereux === 'oui' ? RED : INK });
    row('Conditionnement', r.libelles.conditionnement.join(', '));
    if (r.libelles.poids || r.libelles.dimensions) {
        row('Élément le plus défavorable', [r.libelles.poids, r.libelles.dimensions].filter(Boolean).join(' – '));
    }
    y += 4;

    section('SÉCURITÉ ET CONTRÔLES');
    row('EPI déclarés portés', r.libelles.epi.join(', '));
    row('Lecture du protocole', 'Confirmée par le chauffeur avant signature');
    row('Position GPS', r.gps
        ? `${r.gps.texte} (précision ±${r.gps.accuracy ?? '?'} m) – à ${r.gps.distanceTexte} du chantier`
        : 'Non transmise', { color: r.gps && r.gps.surSite ? INK : RED });
    row('Langue du formulaire', r.libelles.langue);
    if (r.alertes.length) row('Points de vigilance', r.alertes.join(' · '), { color: RED });
    y += 6;

    section('ENGAGEMENT DU CHAUFFEUR');
    const engagement = `Je soussigné(e) ${d.nom}, ${d.fonction.toLowerCase()} pour la société ${d.transporteur}, reconnais avoir `
        + `pris connaissance du protocole de sécurité chargement/déchargement du chantier ${CHANTIER.nom} `
        + `(réf. ${CHANTIER.referenceDocument}), déclare porter les équipements de protection individuelle obligatoires et `
        + "m'engage à respecter l'ensemble des consignes. Je reconnais que le non-respect de ces mesures peut entraîner "
        + "mon exclusion du chantier. Les informations ci-dessus sont déclarées sincères et exactes.";
    const lines = wrap(engagement, font, 9.5, W - 12);
    lines.forEach((l, i) => write(page, l, M + 6, y + 9 + i * 12, { size: 9.5, color: rgb(0.1, 0.1, 0.1) }));
    y += lines.length * 12 + 8;

    // Cadre signature
    const boxH = Math.min(95, 800 - y - 20);
    page.drawRectangle({ x: M + 250, y: H - y - boxH, width: W - 250, height: boxH, borderColor: NAVY, borderWidth: 0.8 });
    write(page, 'Signature du chauffeur', M + 256, y + 11, { size: 8, color: GREY });
    const s = Math.min((W - 262) / sig.width, (boxH - 18) / sig.height);
    page.drawImage(sig, {
        x: M + 250 + (W - 250 - sig.width * s) / 2,
        y: H - y - boxH + 4,
        width: sig.width * s,
        height: sig.height * s,
    });
    write(page, `Signé électroniquement le ${r.date} à ${r.heure}`, M + 6, y + 14, { size: 9.5, font: bold, color: NAVY });
    write(page, `par ${d.nom}`, M + 6, y + 27, { size: 9.5, color: NAVY, maxWidth: 240 });
    write(page, 'Entreprise d\'accueil : ' + 'Demathieu Bard Construction', M + 6, y + 48, { size: 8.5, color: GREY });
    write(page, `Contact chantier : ${CHANTIER.contact.nom}`, M + 6, y + 60, { size: 8.5, color: GREY, maxWidth: 240 });

    // Pied de page identique au document d'origine
    page.drawLine({ start: { x: M, y: H - 812 }, end: { x: 552, y: H - 812 }, thickness: 0.5, color: GREY });
    write(page, `${CHANTIER.referenceDocument} Protocole Sécurité Chargement/Déchargement – Attestation ${r.ref}`, M, 823, { size: 8, color: rgb(0.2, 0.2, 0.2), font });
    write(page, 'Annexe', 552, 823, { size: 8.5, color: rgb(0.2, 0.2, 0.2), align: 'right' });
    void safe;
}

module.exports = { buildPdf };
