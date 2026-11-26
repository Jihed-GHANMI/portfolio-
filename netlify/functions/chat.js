// netlify/functions/chat.js
// Micro-service Serverless pour l'agent IA de Jihed GHANMI avec support RAG & multi-fournisseurs (Gemini & Groq)

exports.handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { message, contextChunks, history, apiKeyOverride, providerOverride, modelOverride, systemPromptOverride } = payload;

    if (!message || typeof message !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message requis' }) };
    }

    // Récupération de la clé API (Environnement Netlify prioritaire, ou clé saisie dans le backoffice)
    const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || (apiKeyOverride && apiKeyOverride.startsWith('AIza') ? apiKeyOverride : null);
    const groqKey = process.env.GROQ_API_KEY || (apiKeyOverride && apiKeyOverride.startsWith('gsk_') ? apiKeyOverride : null);

    const provider = providerOverride || (groqKey ? 'groq' : 'gemini');
    const apiKey = provider === 'groq' ? (groqKey || apiKeyOverride) : (geminiKey || apiKeyOverride);

    // Formulation du prompt RAG avec consignes de rigueur
    const defaultSystemPrompt = `Tu es l'assistant de profil professionnel de Jihed GHANMI, Data Scientist (Finance & IA appliquée).
Ton rôle est de répondre aux recruteurs et visiteurs de façon strictement directe, sobre, concise et factuelle.

DIRECTIVES ABSOLUES :
1. CONCISION ET RÉPONSE DIRECTE :
- Réponds UNIQUEMENT et STRICTEMENT à la question posée, en une à trois phrases maximum.
- Ne récite JAMAIS tout le profil, toute la biographie ou d'autres projets non demandés.
- Exemple : Si on demande quel est son Master, réponds uniquement :
  "Jihed est titulaire d'un Master Professionnel en Data Science obtenu à l'École Supérieure de Commerce de Tunis (ESCT) avec la mention Très Bien (promotion 2024-2026)."
- Exemple : Si on demande son contact, réponds uniquement :
  "Vous pouvez contacter Jihed par email à ghanmijihed33@gmail.com ou par téléphone au +216 53 713 911."
- Exemple : Si on demande un projet précis, résume uniquement ce projet en 2 phrases.

2. ZÉRO EMOJI ET ZÉRO ICÔNE :
- N'utilise AUCUN emoji, AUCUNE icône, AUCUN symbole graphique dans tes réponses.
- Le ton doit être exclusivement corporate, neutre, professionnel et textuel.

3. VÉRACITÉ (RAG) :
- Base-toi uniquement sur les données RAG fournies. Si une information n'est pas renseignée, indique simplement et poliment que vous n'avez pas cette précision et proposez de contacter Jihed directement par email (ghanmijihed33@gmail.com).

4. PRÉSENTATION NATURELLE & SOBRE :
- Ne mentionne JAMAIS de métadonnées, jamais de préfixe comme "Source 1", "FAQ", "Dossier RAG", "D'après les documents", etc.
- Réponds directement et professionnellement au recruteur ou visiteur sans aucun artifice.`;

    const systemPrompt = systemPromptOverride || defaultSystemPrompt;

    let ragContextText = "";
    if (contextChunks && Array.isArray(contextChunks) && contextChunks.length > 0) {
      ragContextText = "\n\n=== CONNAISSANCES OFFICIELLES SUR JIHED GHANMI (RAG) ===\n" + 
        contextChunks.map((c, i) => `[Source ${i+1}: ${c.title || 'Info'}]\n${c.content || c.text || JSON.stringify(c)}`).join("\n\n");
    }

    // 1. SI AUCUNE CLÉ API N'EST CONFIGURÉE : Réponses professionnelles directes basées sur le RAG
    if (!apiKey) {
      const qLower = message.toLowerCase();
      let smartFallbackReply = "";

      if (qLower.includes('master') || qLower.includes('diplom') || qLower.includes('etude') || qLower.includes('formation') || qLower.includes('ecole') || qLower.includes('esct')) {
        smartFallbackReply = "Jihed est titulaire d'un Master Professionnel en Data Science obtenu avec la mention Très Bien à l'École Supérieure de Commerce de Tunis (ESCT, promotion 2024-2026), précédé d'une Licence en Ingénierie Économique et Financière (ESCT, 2021-2024) et d'un Baccalauréat Mathématiques au Lycée Sadiki.";
      } else if (qLower.includes('contact') || qLower.includes('email') || qLower.includes('mail') || qLower.includes('telephone') || qLower.includes('tel') || qLower.includes('joindre')) {
        smartFallbackReply = "Vous pouvez contacter Jihed GHANMI directement par email à ghanmijihed33@gmail.com ou par téléphone au +216 53 713 911 (Tunis, Tunisie).";
      } else if (qLower.includes('experience') || qLower.includes('redig') || qLower.includes('amen') || qLower.includes('stage') || qLower.includes('poste') || qLower.includes('travail')) {
        if (qLower.includes('amen')) {
          smartFallbackReply = "Chez Amen Bank (juillet - septembre 2023), Jihed a modélisé le risque de crédit bancaire sous R pour son projet de fin de licence.";
        } else {
          smartFallbackReply = "Chez Redig.io, Jihed a réalisé son projet de fin d'études en tant que Data Scientist (février - juin 2026), où il a conçu et déployé en production le modèle EvalitX AI validé sur 300 entreprises. Il y a également été assistant digital pendant près de deux ans (2023-2025).";
        }
      } else if (qLower.includes('projet') || qLower.includes('evalitx') || qLower.includes('esg') || qLower.includes('distrisys') || qLower.includes('rafiq')) {
        if (qLower.includes('evalitx')) {
          smartFallbackReply = "EvalitX AI est un modèle d'audit de maturité data et digitale développé chez Redig.io. Il combine la méthode multicritère AHP (Saaty), les référentiels ISO/DAMA/CMMI et l'IA générative (LLM, RAG) pour générer des rapports stratégiques. Validé sur 300 entreprises.";
        } else if (qLower.includes('esg') || qLower.includes('500') || qLower.includes('bourse')) {
          smartFallbackReply = "L'analyse ESG sur le S&P 500 porte sur 503 entreprises (Sustainalytics). Elle associe modélisation statistique du score ESG, segmentation et prédiction de la volatilité boursière via GARCH et réseaux de neurones profonds sur cinq ans de données.";
        } else if (qLower.includes('distrisys') || qLower.includes('etl') || qLower.includes('power bi')) {
          smartFallbackReply = "Distrisys est une chaîne décisionnelle complète : pipelines ETL sous SSIS, entrepôt en étoile sous SQL Server, cube multidimensionnel SSAS (MDX) et tableau de bord de pilotage sous Power BI.";
        } else if (qLower.includes('rafiq') || qLower.includes('svt') || qLower.includes('arabe')) {
          smartFallbackReply = "Rafiq Al-Ulum est un assistant pédagogique en arabe (RTL natif) dédié aux collégiens de 9e année en SVT, s'appuyant sur une architecture RAG indexée sur le programme officiel.";
        } else {
          smartFallbackReply = "Jihed a réalisé quatre études de cas majeures : EvalitX AI (audit par IA & AHP), Analyse des risques ESG S&P 500 (GARCH & Machine Learning), Distrisys (chaîne décisionnelle ETL & Power BI) et Rafiq Al-Ulum (RAG EdTech en arabe).";
        }
      } else if (qLower.includes('competence') || qLower.includes('outil') || qLower.includes('techno') || qLower.includes('stack') || qLower.includes('python')) {
        smartFallbackReply = "Les compétences de Jihed couvrent la Data Science (Python, R, SQL, scikit-learn, XGBoost, AHP), l'IA générative (architectures RAG, prompt engineering, LLM), l'ingénierie des données (PostgreSQL, Supabase, SQL Server, SSIS, SSAS) et la Business Intelligence (Power BI, Recharts).";
      } else if (qLower.includes('disponib') || qLower.includes('embauche') || qLower.includes('recrut') || qLower.includes('cdi') || qLower.includes('opportunit')) {
        smartFallbackReply = "Jihed est diplômé et immédiatement disponible pour des opportunités en CDI, CDD ou missions Data Science / IA / Finance, en Tunisie, en France ou à l'international (présentiel ou remote).";
      } else if (contextChunks && contextChunks.length > 0) {
        const topChunk = contextChunks[0];
        let clean = topChunk.content || topChunk.text || "";
        clean = clean.replace(/^FAQ\s*:\s*[^
]+
*/i, '');
        clean = clean.replace(/^\[[^\]]+\]\s*/i, '');
        smartFallbackReply = clean.trim();
      } else {
        smartFallbackReply = "Jihed GHANMI est Data Scientist spécialisé en Finance & IA appliquée, diplômé d'un Master Professionnel en Data Science avec mention Très Bien à l'ESCT.";
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: smartFallbackReply,
          sources: [],
          isFallback: true
        })
      };
    }

    // 2. APPEL VERS L'API GOOGLE GEMINI 1.5 FLASH (GRATUITE)
    if (provider === 'gemini') {
      const model = modelOverride || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const fullPrompt = `${systemPrompt}${ragContextText}\n\nQuestion de l'utilisateur : ${message}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 600
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error?.message || 'Erreur API Gemini';
        return { statusCode: res.status, headers, body: JSON.stringify({ error: errMsg }) };
      }

      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Désolé, je n'ai pas pu générer de réponse.";
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: replyText,
          sources: [],
          provider: 'Google Gemini'
        })
      };
    }

    // 3. APPEL VERS L'API GROQ (LLAMA-3 GRATUITE)
    if (provider === 'groq') {
      const model = modelOverride || 'llama-3.3-70b-versatile';
      const url = 'https://api.groq.com/openai/v1/chat/completions';

      const messages = [
        { role: 'system', content: `${systemPrompt}${ragContextText}` }
      ];

      if (history && Array.isArray(history)) {
        history.slice(-4).forEach(h => {
          messages.push({ role: h.role, content: h.content });
        });
      }

      messages.push({ role: 'user', content: message });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.35,
          max_tokens: 600
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error?.message || 'Erreur API Groq';
        return { statusCode: res.status, headers, body: JSON.stringify({ error: errMsg }) };
      }

      const replyText = data.choices?.[0]?.message?.content || "Désolé, aucune réponse générée.";
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: replyText,
          sources: [],
          provider: 'Groq Cloud'
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Fournisseur d’IA non supporté' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur interne du serveur : ' + err.message })
    };
  }
};
