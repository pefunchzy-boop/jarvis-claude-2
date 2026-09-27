// JARVIS Gratuit — serveur Node/Express
//
//   GET  /                 l'interface (orbe + cartes + rapports)
//   POST /api/chat         reçoit le texte transcrit par le navigateur (Web
//                          Speech API), l'envoie à Gemini avec function
//                          calling, exécute les actions, renvoie la réponse
//                          à dire à voix haute + les cartes/rapports à afficher
//
// La clé Gemini ne quitte jamais ce serveur : le navigateur ne parle qu'à
// nous, jamais directement à Google.
"use strict";

const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const PORT = process.env.PORT || 8788;

if (!GEMINI_API_KEY) {
  console.warn("\n⚠️  GEMINI_API_KEY manquante — définis-la dans les variables d'environnement Render.\n");
}

// ---------------------------------------------------------------- prompt système

const INSTRUCTIONS = `Tu es JARVIS, l'assistant personnel de monsieur, dans
l'esprit du majordome d'Iron Man. Tu réponds en français avec une pointe
d'élégance so britannique et un flegme impeccable : posé, courtois, jamais
exubérant. Tu t'adresses à l'utilisateur par "monsieur", avec une pointe
d'esprit pince-sans-rire ("Très bien, monsieur.", "Si monsieur veut bien
patienter un instant.").

RÈGLE ABSOLUE : tes réponses parlées sont COURTES (une ou deux phrases max),
naturelles, jamais de longues listes lues à voix haute — pour du contenu
détaillé, utilise display_card ou display_report à la place.

Pour rédiger un post LinkedIn (texte + image), appelle l'outil
generate_linkedin_post avec un prompt clair. Le texte et l'image générés
seront affichés à l'écran, prêts à copier — tu ne publies jamais rien
automatiquement. Annonce brièvement que tu prépares le post, puis résume
oralement une fois prêt (par exemple "Voilà, monsieur, votre post est prêt
à l'écran").

Quand tu veux MONTRER quelque chose à l'écran (résultat, liste, tableau,
extrait de texte, définition), appelle display_card. Utilise-la dès qu'un
visuel aide à la lecture, et garde ta réponse vocale courte.

Pour une ANALYSE DE DONNÉES ou un rapport chiffré, appelle display_report
avec des KPIs, un graphique et/ou un tableau.

Ne lis jamais de longues listes à voix haute : résume, et affiche le détail.`;

// ---------------------------------------------------------------- déclaration des outils (function calling Gemini)

const TOOLS = [{
  functionDeclarations: [
    {
      name: "generate_linkedin_post",
      description: "Génère un post LinkedIn prêt à copier : un texte accrocheur et une image d'illustration. N'est jamais publié automatiquement.",
      parameters: {
        type: "OBJECT",
        properties: {
          sujet: { type: "STRING", description: "Le sujet ou l'angle du post LinkedIn, tel que demandé par l'utilisateur" },
          ton: { type: "STRING", description: "Ton souhaité (ex: professionnel, inspirant, humoristique). Optionnel." },
        },
        required: ["sujet"],
      },
    },
    {
      name: "display_card",
      description: "Affiche une carte visuelle à l'écran : résultats, listes, code, comparaisons. Markdown-lite: **gras**, `code`, lignes '- ' pour puces.",
      parameters: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Titre court de la carte" },
          content: { type: "STRING", description: "Contenu de la carte (markdown-lite)" },
          kind: { type: "STRING", enum: ["info", "result", "code", "warning"], description: "Style visuel" },
        },
        required: ["title", "content"],
      },
    },
    {
      name: "display_report",
      description: "Affiche un tableau de bord complet : indicateurs clés (kpis), graphique (chart), tableau (table), notes markdown. Tous les champs sont optionnels sauf le titre.",
      parameters: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          kpis: {
            type: "ARRAY",
            description: "Indicateurs clés (max 4)",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                value: { type: "STRING", description: "ex: '12 480 €'" },
                delta: { type: "STRING", description: "ex: '+4.2%' ou '-1.1%'" },
              },
            },
          },
          chart: {
            type: "OBJECT",
            properties: {
              type: { type: "STRING", enum: ["line", "bar", "area", "donut"] },
              categories: { type: "ARRAY", items: { type: "STRING" } },
              series: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    data: { type: "ARRAY", items: { type: "NUMBER" } },
                  },
                },
              },
            },
          },
          table: {
            type: "OBJECT",
            properties: {
              columns: { type: "ARRAY", items: { type: "STRING" } },
              rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
            },
          },
          markdown: { type: "STRING", description: "Notes/analyse en markdown" },
        },
        required: ["title"],
      },
    },
  ],
}];

// ---------------------------------------------------------------- appel Gemini

async function callGemini(contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents,
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    tools: TOOLS,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message || JSON.stringify(data).slice(0, 300);
    throw new Error(`Gemini ${r.status}: ${msg}`);
  }
  return data;
}

async function generateLinkedInPost(sujet, ton) {
  // 1) le texte, via le modèle texte
  const textPrompt = `Rédige un post LinkedIn ${ton ? `sur un ton ${ton}` : "professionnel et engageant"} sur le sujet suivant : "${sujet}".
Le post doit être prêt à copier-coller : accroche forte, corps clair avec des retours à la ligne, 3-5 hashtags pertinents à la fin.
Réponds UNIQUEMENT avec le texte du post, sans commentaire ni guillemets autour.`;

  const textUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const textResp = await fetch(textUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: textPrompt }] }] }),
  }).then(r => r.json());
  const postText = textResp?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim()
    || "(le texte n'a pas pu être généré)";

  // 2) l'image, via le modèle image
  let imageDataUrl = null;
  try {
    const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const imgPrompt = `Image d'illustration professionnelle et moderne pour un post LinkedIn sur : ${sujet}. Style épuré, pas de texte dans l'image.`;
    const imgResp = await fetch(imgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: imgPrompt }] }] }),
    }).then(r => r.json());
    const part = imgResp?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part) {
      imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  } catch (err) {
    console.error("Génération image échouée:", err.message);
  }

  return { postText, imageDataUrl };
}

// ---------------------------------------------------------------- boucle de function calling

async function runTurn(history) {
  const displayActions = []; // { kind: "card"|"report"|"post", ... }
  let contents = history;
  let guard = 0;

  while (guard++ < 6) {
    const data = await callGemini(contents);
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const funcCalls = parts.filter(p => p.functionCall);

    if (funcCalls.length === 0) {
      const spoken = parts.map(p => p.text || "").join("").trim();
      return { spoken: spoken || "…", displayActions, history: contents };
    }

    // on ajoute le tour du modèle (avec les appels de fonction) à l'historique
    contents = [...contents, { role: "model", parts }];

    const functionResponses = [];
    for (const fc of funcCalls) {
      const { name, args } = fc.functionCall;
      if (name === "display_card") {
        displayActions.push({ kind: "card", title: args.title, content: args.content, cardKind: args.kind || "info" });
        functionResponses.push({ functionResponse: { name, response: { status: "displayed" } } });
      } else if (name === "display_report") {
        displayActions.push({ kind: "report", report: args });
        functionResponses.push({ functionResponse: { name, response: { status: "displayed" } } });
      } else if (name === "generate_linkedin_post") {
        try {
          const { postText, imageDataUrl } = await generateLinkedInPost(args.sujet, args.ton);
          displayActions.push({ kind: "linkedin", postText, imageDataUrl, sujet: args.sujet });
          functionResponses.push({ functionResponse: { name, response: { status: "généré" } } });
        } catch (err) {
          functionResponses.push({ functionResponse: { name, response: { status: "erreur", error: String(err.message || err) } } });
        }
      } else {
        functionResponses.push({ functionResponse: { name, response: { status: "inconnu" } } });
      }
    }
    contents = [...contents, { role: "user", parts: functionResponses }];
  }

  return { spoken: "Désolé monsieur, une boucle inattendue s'est produite.", displayActions, history: contents };
}

// ---------------------------------------------------------------- routes

app.post("/api/chat", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY manquante côté serveur." });
  }
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message manquant" });
    }
    // history: liste de { role: "user"|"model", parts: [{text}] } envoyée par le client
    // (le client ne garde que les tours texte simples, pas les function calls, pour rester léger)
    const contents = [...(Array.isArray(history) ? history : []), { role: "user", parts: [{ text: message }] }];
    const result = await runTurn(contents);
    res.json({ spoken: result.spoken, actions: result.displayActions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: !!GEMINI_API_KEY, model: GEMINI_MODEL });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`\n  JARVIS Gratuit -> http://localhost:${PORT}\n`);
});
