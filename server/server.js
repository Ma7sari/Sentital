import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import { google } from "googleapis";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${port}/auth/google/callback`
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Middleware ─────────────────────────────────────────────────

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "sentinel-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

app.use(express.static(join(__dirname, "public")));

// ── Auth helpers ───────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.redirect("/?login=required");
  }
  next();
}

// ── OAuth routes ───────────────────────────────────────────────

app.get("/auth/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect("/?error=oauth_not_configured");
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
    prompt: "consent",
  });
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect("/?error=no_code");

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    req.session.user = {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
    req.session.tokens = tokens;

    res.redirect("/monitor");
  } catch (e) {
    console.error("OAuth error:", e);
    res.redirect("/?error=auth_failed");
  }
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Ej inloggad" });
  }
  res.json({ user: req.session.user, hasGmail: !!req.session.tokens });
});

// ── Gmail API helpers ─────────────────────────────────────────

function getGmailClient(req) {
  if (!req.session?.tokens) return null;
  oauth2Client.setCredentials(req.session.tokens);
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function getHeader(headers, name) {
  const h = (headers || []).find((x) => x.name?.toLowerCase() === name?.toLowerCase());
  return h ? h.value : "";
}

function decodeBase64Url(str) {
  if (!str) return "";
  const safe = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(safe, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) return decodeBase64Url(p.body.data);
      if (p.mimeType === "text/html" && p.body?.data) {
        const html = decodeBase64Url(p.body.data);
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  }
  return "";
}

// ── Gmail routes ───────────────────────────────────────────────

app.get("/api/gmail/emails", requireAuth, async (req, res) => {
  try {
    const gmail = getGmailClient(req);
    if (!gmail) {
      return res.status(400).json({ error: "Gmail ej kopplad. Logga in med Google först." });
    }

    const maxResults = Math.min(parseInt(req.query.limit) || 10, 50);
    const { data } = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: "in:inbox",
    });

    const messages = data.messages || [];
    const results = [];

    for (const m of messages) {
      try {
        const { data: msg } = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "full",
        });

        const payload = msg.payload || {};
        const headers = payload.headers || [];
        const importantHeaders = [
          "From", "To", "Subject", "Date", "Return-Path", "Reply-To",
          "Received-SPF", "Authentication-Results", "DKIM-Signature",
        ];

        const filtered = headers.filter((h) =>
          importantHeaders.some((ih) => h.name?.toLowerCase() === ih.toLowerCase())
        );

        results.push({
          id: msg.id,
          from: getHeader(headers, "From"),
          subject: getHeader(headers, "Subject"),
          date: getHeader(headers, "Date"),
          returnPath: getHeader(headers, "Return-Path"),
          replyTo: getHeader(headers, "Reply-To"),
          spf: getHeader(headers, "Received-SPF"),
          authResults: getHeader(headers, "Authentication-Results"),
          headers: filtered,
          snippet: msg.snippet || "",
          bodyText: extractBody(payload).slice(0, 3000),
        });
      } catch {
        // skip
      }
    }

    res.json({ emails: results });
  } catch (e) {
    console.error("Gmail API error:", e);
    res.status(500).json({ error: e.message || "Kunde inte hämta mejl" });
  }
});

// ── AI analyze email (internal) ───────────────────────────────

const EMAIL_SYSTEM_PROMPT = `Du är en avancerad e-postsäkerhetsanalytiker. Din uppgift är att skydda vanliga användare, äldre och företag från bedrägerier.

Analysera e-posten noggrant och kontrollera ALLA dessa punkter:

1. AVSÄNDARE
   - Matchar visningsnamnet den faktiska e-postadressen? (t.ex. "PayPal <hacker@evil.com>" = spoofing)
   - Ser domänen legitim ut? (t.ex. paypa1.com istället för paypal.com)
   - Stämmer Return-Path med From-adressen?
   - Stämmer Reply-To med From-adressen?

2. AUTENTISERING
   - SPF-resultat (pass/fail/softfail/none)
   - DKIM-signatur (giltig/ogiltig/saknas)
   - DMARC-resultat om tillgängligt
   - Authentication-Results header

3. INNEHÅLL
   - Innehåller brådskande språk? ("Ditt konto stängs", "Agera nu", "Sista chansen")
   - Ber om personlig information, lösenord eller betalning?
   - Grammatik- och stavfel som tyder på bedrägeri?
   - Misstänkta länkar eller URL:er som inte matchar avsändaren?
   - Försöker den imitera ett känt varumärke?

4. TEKNISKA TECKEN
   - X-Mailer header (ovanlig klient?)
   - X-Originating-IP (misstänkt ursprung?)
   - Received-kedjan (stämmer den?)

SVARA på svenska i detta format:
Risknivå: [Låg / Medel / Hög]

Avsändare: [kort bedömning]
Autentisering: [kort bedömning]
Innehåll: [kort bedömning]

Sammanfattning: [1-2 meningar som förklarar bedömningen på ett enkelt och tydligt sätt som alla förstår]`;

async function analyzeEmailWithAI(email) {
  const headersBlock = (email.headers || [])
    .map((h) => `${h.name}: ${h.value}`)
    .join("\n")
    .slice(0, 5000);

  const quickFacts = [
    `From: ${email.from}`,
    email.returnPath ? `Return-Path: ${email.returnPath}` : null,
    email.replyTo ? `Reply-To: ${email.replyTo}` : null,
    email.spf ? `Received-SPF: ${email.spf}` : null,
    email.authResults ? `Authentication-Results: ${email.authResults}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const content = [
    "=== SNABBÖVERSIKT ===",
    quickFacts,
    "",
    "=== ALLA HEADERS ===",
    headersBlock,
    "",
    "=== FÖRHANDSGRANSKNING ===",
    (email.snippet || "").slice(0, 500),
    "",
    "=== MEJLTEXT ===",
    (email.bodyText || "").slice(0, 3000),
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: EMAIL_SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  return completion.choices[0].message.content;
}

app.post("/api/gmail/scan", requireAuth, async (req, res) => {
  try {
    const gmail = getGmailClient(req);
    if (!gmail) {
      return res.status(400).json({ error: "Gmail ej kopplad." });
    }

    const limit = Math.min(parseInt(req.body?.limit) || 10, 50);

    const { data } = await gmail.users.messages.list({
      userId: "me",
      maxResults: limit,
      q: "in:inbox",
    });

    const messages = data.messages || [];
    const analyses = [];

    for (const m of messages) {
      try {
        const { data: msg } = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "full",
        });

        const payload = msg.payload || {};
        const headers = payload.headers || [];
        const importantHeaders = [
          "From", "To", "Subject", "Date", "Return-Path", "Reply-To",
          "Received-SPF", "Authentication-Results", "DKIM-Signature",
        ];
        const filtered = headers.filter((h) =>
          importantHeaders.some((ih) => h.name?.toLowerCase() === ih.toLowerCase())
        );

        const email = {
          from: getHeader(headers, "From"),
          subject: getHeader(headers, "Subject"),
          returnPath: getHeader(headers, "Return-Path"),
          replyTo: getHeader(headers, "Reply-To"),
          spf: getHeader(headers, "Received-SPF"),
          authResults: getHeader(headers, "Authentication-Results"),
          headers: filtered,
          snippet: msg.snippet || "",
          bodyText: extractBody(payload).slice(0, 3000),
        };

        const analysis = await analyzeEmailWithAI(email);
        analyses.push({
          from: email.from,
          subject: email.subject,
          analysis,
        });
      } catch (e) {
        analyses.push({
          from: "(okänd)",
          subject: "(kunde inte läsa)",
          analysis: "Kunde inte analysera detta mejl.",
        });
      }
    }

    res.json({ analyses });
  } catch (e) {
    console.error("Scan error:", e);
    res.status(500).json({ error: e.message || "Skanningsfel" });
  }
});

// ── Legacy API (för extension om den används) ──────────────────

app.post("/analyze", async (req, res) => {
  try {
    const text = (req.body?.text || "").slice(0, 12000);
    if (!text.trim()) return res.status(400).json({ error: "Ingen text mottogs" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Analysera sidan kort och tydligt. Svara på svenska." },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });

    res.json({ analysis: completion.choices[0].message.content });
  } catch (e) {
    console.error("AI ERROR:", e);
    res.status(500).json({ error: e.message || "AI-anrop misslyckades" });
  }
});

app.post("/analyze-email", async (req, res) => {
  try {
    const { headers = [], snippet = "", bodyText = "", from = "", returnPath = "", replyTo = "", spf = "", authResults = "" } = req.body || {};
    if (!headers.length && !snippet && !bodyText && !from) {
      return res.status(400).json({ error: "Ingen e-postdata mottogs" });
    }

    const headersBlock = headers.map((h) => `${h.name}: ${h.value}`).join("\n").slice(0, 5000);
    const quickFacts = [
      `From: ${from}`,
      returnPath ? `Return-Path: ${returnPath}` : null,
      replyTo ? `Reply-To: ${replyTo}` : null,
      spf ? `Received-SPF: ${spf}` : null,
      authResults ? `Authentication-Results: ${authResults}` : null,
    ].filter(Boolean).join("\n");

    const content = [
      "=== SNABBÖVERSIKT ===", quickFacts, "",
      "=== ALLA HEADERS ===", headersBlock, "",
      "=== FÖRHANDSGRANSKNING ===", (snippet || "").slice(0, 500), "",
      "=== MEJLTEXT ===", (bodyText || "").slice(0, 3000),
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: EMAIL_SYSTEM_PROMPT },
        { role: "user", content },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    res.json({ analysis: completion.choices[0].message.content });
  } catch (e) {
    console.error("EMAIL AI ERROR:", e);
    res.status(500).json({ error: e.message || "E-postanalys misslyckades" });
  }
});

// ── Serve SPA routes ───────────────────────────────────────────

app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(join(__dirname, "public", "dashboard.html"));
});

app.get("/monitor", requireAuth, (req, res) => {
  res.sendFile(join(__dirname, "public", "monitor.html"));
});

app.get("/protected", requireAuth, (req, res) => {
  res.sendFile(join(__dirname, "public", "protected.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(join(__dirname, "public", "register.html"));
});

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Sentinel running on http://localhost:${port}`);
});
