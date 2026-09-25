'use strict';
/**
 * Envoi de l'e-mail de validation via l'API transactionnelle Brevo.
 * Sans clé BREVO_API_KEY (tests en local), l'e-mail et le PDF sont écrits dans ./outbox/.
 */
const fs = require('fs');
const path = require('path');
const { CHANTIER, CONFIG } = require('./config');

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function buildEmail(d, r) {
    const statut = r.alertes.length ? '⚠️' : '✅';
    const subject = `${statut} Protocole ${CHANTIER.nom} – ${d.entreprise} – ${d.transporteur} – ${d.nom} (${r.heure})`;

    const line = (label, value, strong = false) => `
        <tr>
          <td style="padding:6px 10px;color:#555;width:38%;vertical-align:top;border-bottom:1px solid #eee;">${esc(label)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;${strong ? 'font-weight:bold;' : ''}">${value}</td>
        </tr>`;
    const section = (title) => `
        <tr><td colspan="2" style="background:#EB6608;color:#fff;font-weight:bold;padding:7px 10px;font-size:13px;letter-spacing:.3px;">${esc(title)}</td></tr>`;

    const alertes = r.alertes.length
        ? `<div style="background:#fdecea;border:1px solid #f5c2c0;color:#a61b1b;padding:10px 14px;border-radius:6px;margin:0 0 14px;">
             <strong>Points de vigilance :</strong><ul style="margin:6px 0 0 18px;padding:0;">
             ${r.alertes.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`
        : `<div style="background:#e8f6ee;border:1px solid #bfe5cc;color:#11643a;padding:10px 14px;border-radius:6px;margin:0 0 14px;">
             <strong>Aucun point de vigilance</strong> – chauffeur sur site, véhicule conforme, pas de produit dangereux déclaré.</div>`;

    const gps = r.gps
        ? `<a href="${esc(r.gps.lien)}" style="color:#003366;">${esc(r.gps.texte)}</a> – à <strong>${esc(r.gps.distanceTexte)}</strong> du chantier (±${esc(r.gps.accuracy ?? '?')} m)`
        : '<span style="color:#a61b1b;">Non transmise</span>';

    const html = `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f2f4f7;">
<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px;margin:0 auto;background:#fff;border:1px solid #dde1e6;">
  <div style="background:#000048;color:#fff;padding:16px 20px;">
    <div style="font-size:18px;font-weight:bold;">Protocole de sécurité validé</div>
    <div style="font-size:13px;opacity:.85;margin-top:3px;">${esc(CHANTIER.nom)} · ${esc(r.date)} à ${esc(r.heure)} · Réf. ${esc(r.ref)}</div>
  </div>
  <div style="padding:16px 20px;">
    ${alertes}
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${section('Livraison')}
      ${line('Entreprise livrée', esc(d.entreprise), true)}
      ${line('Opération', `${esc(r.libelles.operation)}<br><span style="color:#666;font-size:12px;">${esc(r.libelles.realisation)}</span>`)}
      ${line('Matières transportées', esc(d.matieres), true)}
      ${line('Produits dangereux', d.produits_dangereux === 'oui' ? `<span style="color:#a61b1b;font-weight:bold;">${esc(r.libelles.dangers.join(', '))}</span>` : 'Non')}
      ${line('Conditionnement', esc(r.libelles.conditionnement.join(', ')))}
      ${r.libelles.poids || r.libelles.dimensions ? line('Élément le plus défavorable', esc([r.libelles.poids, r.libelles.dimensions].filter(Boolean).join(' – '))) : ''}
      ${section('Transport')}
      ${line('Chauffeur', `${esc(d.nom)} – <a href="tel:${esc(d.telephone.replace(/[^\d+]/g, ''))}" style="color:#003366;">${esc(d.telephone)}</a>`, true)}
      ${line('Transporteur', esc(d.transporteur))}
      ${d.fournisseur ? line('Fournisseur', esc(d.fournisseur)) : ''}
      ${line('Immatriculation', esc(d.immatriculation))}
      ${line('Véhicule', `${esc(r.libelles.tonnage)} – ${esc(r.libelles.caracteristiques.join(', '))}`)}
      ${line('Gabarit', `Hauteur &lt; 4,2 m : <strong>${d.hauteur_ok === 'oui' ? 'oui' : '<span style="color:#a61b1b;">NON</span>'}</strong> · Longueur &lt; 8 m : <strong>${d.longueur_ok === 'oui' ? 'oui' : '<span style="color:#a61b1b;">NON</span>'}</strong>`)}
      ${line('Moyens de manutention', esc(r.libelles.manutention.join(', ') || 'Aucun déclaré'))}
      ${section('Sécurité')}
      ${line('EPI déclarés portés', esc(r.libelles.epi.join(', ')))}
      ${line('Protocole', 'Lu et accepté, signé électroniquement')}
      ${line('Position GPS', gps)}
      ${line('Langue du formulaire', esc(r.libelles.langue))}
    </table>
    <p style="font-size:13px;color:#555;margin:16px 0 0;">📎 En pièce jointe : le <strong>protocole officiel ${esc(CHANTIER.referenceDocument)} rempli</strong> avec les informations du chauffeur, sa signature et la page d'attestation.</p>
  </div>
  <div style="background:#f7f7f9;color:#888;font-size:11px;padding:10px 20px;border-top:1px solid #eee;">
    E-mail automatique – formulaire QR code « Protocole de sécurité ${esc(CHANTIER.nom)} ». Horodatage serveur (heure de Paris) : ${esc(r.horodatage)}.
  </div>
</div></body></html>`;

    const text = [
        `PROTOCOLE DE SÉCURITÉ VALIDÉ – ${CHANTIER.nom}`,
        `Réf. ${r.ref} – ${r.date} à ${r.heure}`,
        r.alertes.length ? `\nPOINTS DE VIGILANCE :\n- ${r.alertes.join('\n- ')}` : '\nAucun point de vigilance.',
        '',
        `Entreprise livrée : ${d.entreprise}`,
        `Opération : ${r.libelles.operation} (${r.libelles.realisation})`,
        `Matières : ${d.matieres}`,
        `Chauffeur : ${d.nom} – ${d.telephone}`,
        `Transporteur : ${d.transporteur}${d.fournisseur ? ` / Fournisseur : ${d.fournisseur}` : ''}`,
        `Immatriculation : ${d.immatriculation}`,
        `GPS : ${r.gps ? `${r.gps.texte} (${r.gps.distanceTexte} du chantier)` : 'non transmis'}`,
    ].join('\n');

    return { subject, html, text };
}

async function sendEmail(d, r, pdfBuffer) {
    const { subject, html, text } = buildEmail(d, r);

    if (!CONFIG.brevoApiKey) {
        const dir = path.join(__dirname, '..', 'outbox');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${r.ref}.html`), `<!-- ${subject} -->\n${html}`);
        fs.writeFileSync(path.join(dir, r.fichier), pdfBuffer);
        console.log(`[mode test] BREVO_API_KEY absente : e-mail écrit dans outbox/${r.ref}.html`);
        return { messageId: 'test-' + r.ref, test: true };
    }

    const body = {
        sender: { name: CONFIG.expediteur.nom, email: CONFIG.expediteur.email },
        to: CONFIG.destinataires.map((email) => ({ email })),
        subject,
        htmlContent: html,
        textContent: text,
        attachment: [{ name: r.fichier, content: pdfBuffer.toString('base64') }],
        tags: ['protocole-securite', CHANTIER.code],
    };
    if (CONFIG.copieCachee.length) body.bcc = CONFIG.copieCachee.map((email) => ({ email }));
    if (CONFIG.repondreA) body.replyTo = { email: CONFIG.repondreA };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': CONFIG.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        const e = new Error(`Brevo ${res.status} : ${payload.code || ''} ${payload.message || ''}`.trim());
        e.status = res.status;
        throw e;
    }
    return { messageId: payload.messageId };
}

module.exports = { sendEmail, buildEmail };
