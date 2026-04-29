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
            </div>`;
        
        // --- LA CORRECTION "MIRACLE" ---
        // On ne met PAS ton adresse perso ici, on laisse Brevo utiliser son système
        sendSmtpEmail.sender = { "name": "Protocole Chantier", "email": "notifications@brevo.com" };
        
        // C'est ICI que tu reçois le mail
        sendSmtpEmail.to = [{ "email": "bestafacilities@outlook.fr" }];

        // Si tu cliques sur "Répondre", ça écrira à ton adresse
        sendSmtpEmail.replyTo = { "email": "bestafacilities@outlook.fr" };
        // ------------------------------

        const cleanPdf = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
        const cleanSig = signatureImage.includes(',') ? signatureImage.split(',')[1] : signatureImage;

        sendSmtpEmail.attachment = [
            { "content": cleanPdf, "name": filename || "protocole.pdf" },
            { "content": cleanSig, "name": `Signature_${nom.replace(/\s+/g, '_')}.png` }
        ];

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);