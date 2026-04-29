require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const SibApiV3Sdk = require('sib-api-v3-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '50mb' }));

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

app.post('/send', async (req, res) => {
    console.log("Démarrage de la procédure d'envoi pour :", req.body.nom);
    try {
        const { 
            raison, societe, entreprise, type_operation, matieres,
            type_vehicule, caracteristiques, livraison_mode,
            date, heure, nom, pdfBase64, signatureImage, 
            coords, epi_verifies, filename
        } = req.body;

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = `✅ PROTOCOLE VALIDÉ - ${entreprise.toUpperCase()} - ${nom}`;
        
        sendSmtpEmail.htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                <h2 style="color: #003366; border-bottom: 4px solid #FF6600; padding-bottom: 10px;">Validation Entrée Chantier</h2>
                <p style="background: #fdf2f2; padding: 10px; border-radius: 5px; color: #c53030; font-weight: bold;">
                    🛡️ EPI Vérifiés : OUI | 📍 GPS : ${coords || 'Non détecté'}
                </p>
                <h3 style="color: #FF6600;">Infos Chauffeur</h3>
                <p><strong>Nom :</strong> ${nom} | <strong>Société :</strong> ${raison}</p>
                <p><strong>Livraison pour :</strong> ${entreprise}</p>
                <h3 style="color: #FF6600;">Détails</h3>
                <p><strong>Véhicule :</strong> ${type_vehicule || 'N/A'} (${caracteristiques})</p>
                <p><strong>Opération :</strong> ${type_operation} (${livraison_mode})</p>
            </div>`;
        
        sendSmtpEmail.sender = { "name": "Gare Logistique", "email": "bestafacilities@outlook.fr" };
        sendSmtpEmail.to = [{ "email": "bestafacilities@outlook.fr" }];
        
        // Nettoyage des chaînes Base64 au cas où
        const cleanPdf = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
        const cleanSig = signatureImage.includes(',') ? signatureImage.split(',')[1] : signatureImage;

        sendSmtpEmail.attachment = [
            { "content": cleanPdf, "name": filename || "protocole.pdf" },
            { "content": cleanSig, "name": `Signature_${nom.replace(/\s+/g, '_')}.png` }
        ];

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Email envoyé avec succès ! ID:", data.messageId);
        res.json({ success: true, messageId: data.messageId });
    } catch (error) {
        // C'est ici qu'on verra pourquoi Brevo dit non
        console.error("ERREUR BREVO détaillée:", error.response ? error.response.body : error);
        res.status(500).json({ error: 'Erreur Brevo', details: error.message });
    }
});
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));