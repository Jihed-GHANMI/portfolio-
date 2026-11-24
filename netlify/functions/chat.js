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
- Base-toi uniquement sur les données RAG fournies. Si une information n'est pas renseignée, indique simplement que le dossier ne contient pas cette information et oriente vers l'email de Jihed.`;

    const systemPrompt = systemPromptOverride || defaultSystemPrompt;

    let ragContextText = "";
    if (contextChunks && Array.isArray(contextChunks) && contextChunks.length > 0) {
      ragContextText = "\n\n=== CONNAISSANCES OFFICIELLES SUR JIHED GHANMI (RAG) ===\n" + 
        contextChunks.map((c, i) => `[Source ${i+1}: ${c.title || 'Info'}]\n${c.content || c.text || JSON.stringify(c)}`).join("\n\n");
    }

    // 1. SI AUCUNE CLÉ API N'EST CONFIGURÉE : Mode Fallback Intelligent basé sur le RAG
    if (!apiKey) {
      let smartFallbackReply = "";
      if (contextChunks && contextChunks.length > 0) {
        const topChunk = contextChunks[0];
        smartFallbackReply = `Je peux vous renseigner à ce sujet ! D'après le dossier professionnel de Jihed :\n\n` +
          `**${topChunk.title}** :\n${topChunk.content || topChunk.text}\n\n` +
          `*💡 Astuce : Jihed peut activer la synthèse neuronale en direct en configurant une clé API gratuite dans le Backoffice.*`;
      } else {
        smartFallbackReply = `Bonjour ! Je suis l'assistant de Jihed GHANMI. Vous pouvez me poser des questions sur son parcours (Master Data Science ESCT avec Mention Très Bien), ses 4 projets phares (EvalitX AI, ESG S&P 500, Distrisys, Rafiq Al-Ulum) ou ses compétences en Python, R, LLM et RAG. Vous pouvez également le contacter directement à ghanmijihed33@gmail.com.`;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: smartFallbackReply,
          sources: contextChunks ? contextChunks.map(c => c.title) : ['Profil Jihed GHANMI'],
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
          sources: contextChunks ? contextChunks.map(c => c.title) : [],
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
          sources: contextChunks ? contextChunks.map(c => c.title) : [],
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
