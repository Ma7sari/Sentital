/**
 * Sentinel – webbserver (Express)
 *
 * Ansvar: HTTP API, statiska sidor under public/, sessions, Google OAuth + Gmail,
 *         OpenAI-anrop för mejl- och sidanalys. Single-file entry för enkel deploy.
 *
 * Viktiga begrepp:
 * - requireAuth: skyddade sidor/API som kräver req.session.user
 * - gmailMock: demo/test utan riktig Gmail (fictiva mejl)
 * - getOpenAI(): lazy init så servern startar utan OPENAI_API_KEY
 *
 * Se docs/TEKNISK-DOKUMENTATION.md för route-lista och dataflöden.
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import { google } from "googleapis";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import crypto from "crypto";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

/** Bakom Railway/reverse proxy måste Express lita på X-Forwarded-* (HTTPS, IP). */
app.set("trust proxy", 1);

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `http://localhost:${port}/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

let cachedOpenAI = null;
function getOpenAI() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!cachedOpenAI) cachedOpenAI = new OpenAI({ apiKey: key });
  return cachedOpenAI;
}

function devLoginSecret() {
  return process.env.DEV_LOGIN_SECRET?.trim() || "";
}

function safePasswordCompare(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Fictiva mejl för test utan Gmail-API (demo + dev-login). */
function getMockSampleEmails() {
  return [
    {
      from: "Säkerhet – Exempelbank <noreply@bank-example.se>",
      subject: "Ny inloggning från okänd enhet",
      returnPath: "<bounces@bank-example.se>",
      replyTo: "",
      spf: "pass",
      authResults: "spf=pass; dkim=pass; dmarc=pass",
      headers: [
        { name: "From", value: "Säkerhet – Exempelbank <noreply@bank-example.se>" },
        { name: "Subject", value: "Ny inloggning från okänd enhet" },
        { name: "Return-Path", value: "<bounces@bank-example.se>" },
        { name: "Authentication-Results", value: "spf=pass; dkim=pass; dmarc=pass" },
      ],
      snippet: "Vi noterade en inloggning från Stockholm. Om det inte var du, kontakta oss.",
      bodyText:
        "Hej,\n\nVi noterade en inloggning på ditt konto idag kl. 09:14 från en enhet i Stockholm.\n\nOm det var du behöver du inte göra något.\n\nMed vänliga hälsningar,\nExempelbank",
    },
    {
      from: "PayPal Service <service@paypa1-security.net>",
      subject: "Åtgärd krävs: begränsat konto",
      returnPath: "<mail@paypa1-security.net>",
      replyTo: "support@phish-example.invalid",
      spf: "fail",
      authResults: "spf=fail; dkim=none",
      headers: [
        { name: "From", value: "PayPal Service <service@paypa1-security.net>" },
        { name: "Subject", value: "Åtgärd krävs: begränsat konto" },
        { name: "Return-Path", value: "<mail@paypa1-security.net>" },
        { name: "Reply-To", value: "support@phish-example.invalid" },
        { name: "Received-SPF", value: "fail" },
        { name: "Authentication-Results", value: "spf=fail; dkim=none" },
      ],
      snippet: "Ditt konto har begränsats. Verifiera din identitet nu...",
      bodyText:
        "Hej kund,\n\nVi har begränsat ditt konto på grund av misstänkt aktivitet.\n\nKlicka här för att återställa: http://paypa1-security.net/verify\n\nVi behöver ditt lösenord och kortnummer för verifiering.\n\nPayPal Team",
    },
    {
      from: "Faktura <faktura@leverantor-nordic.com>",
      subject: "Faktura 2026-1042 förfaller imorgon",
      returnPath: "<faktura@leverantor-nordic.com>",
      replyTo: "",
      spf: "pass",
      authResults: "spf=pass; dkim=pass",
      headers: [
        { name: "From", value: "Faktura <faktura@leverantor-nordic.com>" },
        { name: "Subject", value: "Faktura 2026-1042 förfaller imorgon" },
      ],
      snippet: "Bilagd PDF med fakturauppgifter. Betalning via bankgiro.",
      bodyText:
        "Hej,\n\nBifogad faktura 2026-1042 på 4 250 kr inkl. moms. Förfallodatum imorgon.\n\nBankgiro: 999-1234\nReferens: INV-2026-1042\n\nMed vänlig hälsning\nLeverantör Nordic AB",
    },
  ];
}

function useGmailMock(req) {
  return !!(req.session?.gmailMock && !req.session?.tokens);
}

// ── Middleware ─────────────────────────────────────────────────

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
const sessionCookieSecure =
  process.env.FORCE_SESSION_SECURE === "1" ||
  process.env.NODE_ENV === "production";

app.use(
  session({
    name: "sentinel.sid",
    secret: process.env.SESSION_SECRET || "sentinel-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: sessionCookieSecure,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
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

app.get("/demo", (req, res) => {
  req.session.user = {
    id: "demo",
    email: "demo@sentinel.se",
    name: "Demo Användare",
    picture: "",
  };
  req.session.tokens = null;
  req.session.gmailMock = true;
  res.redirect("/monitor");
});

app.get("/login", (req, res) => {
  res.sendFile(join(__dirname, "public", "login.html"));
});

app.post("/auth/dev-login", (req, res) => {
  const secret = devLoginSecret();
  if (!secret) {
    return res.status(404).json({ error: "not_found" });
  }
  const password = req.body?.password;
  if (!safePasswordCompare(password || "", secret)) {
    return res.status(401).json({ error: "Fel lösenord." });
  }
  const name = (req.body?.name || "Testanvändare").toString().trim().slice(0, 120) || "Testanvändare";
  const email = (req.body?.email || "test@sentinel.dev").toString().trim().slice(0, 320) || "test@sentinel.dev";

  req.session.user = {
    id: "dev-" + crypto.randomBytes(8).toString("hex"),
    email,
    name,
    picture: "",
  };
  req.session.tokens = null;
  req.session.gmailMock = true;
  res.json({ ok: true });
});

app.get("/auth/google", (req, res) => {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    return res.redirect("/?error=oauth_not_configured");
  }
  const oauth2Client = createOAuth2Client();
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

    const oauth2Client = createOAuth2Client();
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
    req.session.gmailMock = false;

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
  res.json({
    user: req.session.user,
    hasGmail: !!req.session.tokens,
    gmailMock: !!req.session.gmailMock && !req.session.tokens,
  });
});

// ── Gmail API helpers ─────────────────────────────────────────

function getGmailClient(req) {
  if (!req.session?.tokens) return null;
  const client = createOAuth2Client();
  client.setCredentials(req.session.tokens);
  return google.gmail({ version: "v1", auth: client });
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
    if (useGmailMock(req)) {
      const maxResults = Math.min(parseInt(req.query.limit) || 10, 50);
      const samples = getMockSampleEmails().slice(0, maxResults);
      const results = samples.map((e, i) => ({
        id: `mock-${i}`,
        from: e.from,
        subject: e.subject,
        date: new Date().toISOString(),
        returnPath: e.returnPath,
        replyTo: e.replyTo,
        spf: e.spf,
        authResults: e.authResults,
        headers: e.headers,
        snippet: e.snippet,
        bodyText: e.bodyText,
      }));
      return res.json({ emails: results, mock: true });
    }

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

  const openai = getOpenAI();
  if (!openai) throw new Error("OPENAI_API_KEY saknas");

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
    if (!getOpenAI()) {
      return res.status(503).json({
        error: "OPENAI_API_KEY saknas. Lägg till variabeln i Railway (Variables) eller i server/.env.",
      });
    }

    const limit = Math.min(parseInt(req.body?.limit) || 10, 50);

    if (useGmailMock(req)) {
      const messages = getMockSampleEmails().slice(0, limit);
      const analyses = [];
      for (const email of messages) {
        try {
          const analysis = await analyzeEmailWithAI(email);
          analyses.push({ from: email.from, subject: email.subject, analysis });
        } catch {
          analyses.push({
            from: email.from,
            subject: email.subject,
            analysis: "Kunde inte analysera detta mejl.",
          });
        }
      }
      return res.json({ analyses, mock: true });
    }

    const gmail = getGmailClient(req);
    if (!gmail) {
      return res.status(400).json({ error: "Gmail ej kopplad." });
    }

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

const PAGE_ANALYZE_PROMPT = `Du är en säkerhetsexpert som bedömer om webbsidor är äkta eller falska (phishing, scam, bedrägeri).

Analysera sidan och bedöm:

1. ÄKTHET
   - Ser sidan ut att vara en legitim tjänst eller en imitation?
   - Matchar innehållet domänen/URL:en? (t.ex. "PayPal" på paypa1-fake.com = falsk)
   - Finns tecken på varumärkesimitation?

2. URL & DOMÄN
   - Ser domänen misstänkt ut? (stavfel, onaturliga suffix, IP-adresser)
   - Är URL:en ovanligt lång eller innehåller den många parametrar?
   - Använder sidan HTTPS?

3. INNEHÅLL
   - Brådskande språk? ("Ditt konto stängs", "Agera nu", "Sista chansen")
   - Begär sidan lösenord, kortnummer eller personlig information?
   - Grammatik- och stavfel som tyder på bedrägeri?
   - Länkar som pekar till andra misstänkta domäner?

4. TRUST-INDIKATORER
   - Nämns etablerade företag, banker eller tjänster?
   - Finns kontaktuppgifter som verkar legitima?

SVARA på svenska i detta format:
Bedömning: [Äkta / Troligen äkta / Osäker / Troligen falsk / Falsk]

URL: [kort bedömning av domänen]
Innehåll: [kort bedömning]
Risknivå: [Låg / Medel / Hög]

Sammanfattning: [1-2 meningar som förklarar om sidan verkar äkta eller inte, och vad användaren bör tänka på]`;

app.post("/analyze", async (req, res) => {
  try {
    const openai = getOpenAI();
    if (!openai) {
      return res.status(503).json({
        error: "OPENAI_API_KEY saknas. Lägg till variabeln i Railway eller server/.env.",
      });
    }

    const text = (req.body?.text || "").slice(0, 12000);
    const url = req.body?.url || "";
    if (!text.trim()) return res.status(400).json({ error: "Ingen text mottogs" });

    const content = url
      ? `URL: ${url}\n\n=== SIDINNEHÅLL ===\n${text}`
      : text;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: PAGE_ANALYZE_PROMPT },
        { role: "user", content },
      ],
      temperature: 0.1,
      max_tokens: 450,
    });

    res.json({ analysis: completion.choices[0].message.content });
  } catch (e) {
    console.error("AI ERROR:", e);
    res.status(500).json({ error: e.message || "AI-anrop misslyckades" });
  }
});

app.post("/analyze-email", async (req, res) => {
  try {
    const openai = getOpenAI();
    if (!openai) {
      return res.status(503).json({
        error: "OPENAI_API_KEY saknas. Lägg till variabeln i Railway eller server/.env.",
      });
    }

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
  const g = getGoogleOAuthConfig();
  const cid = g.clientId;
  const clientIdShapeOk = /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(cid);
  res.json({
    ok: true,
    openai: !!process.env.OPENAI_API_KEY?.trim(),
    devLogin: !!devLoginSecret(),
    google: {
      clientIdSet: !!cid,
      clientSecretSet: !!g.clientSecret,
      redirectUri: g.redirectUri,
      /** Om false: ID:t ser inte ut som ett Web client-ID (kolla copy-paste / fel klienttyp). */
      clientIdFormatWeb: clientIdShapeOk,
    },
    session: {
      secureCookies: sessionCookieSecure,
      trustProxy: app.get("trust proxy"),
    },
  });
});

// ── Start ─────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Sentinel running on http://localhost:${port}`);
});
