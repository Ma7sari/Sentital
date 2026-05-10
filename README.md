# Sentinel – AI-skydd mot e-postbedrägerier

En webbapp där du kopplar ihop ditt Gmail-konto och låter AI:n gå igenom dina mejl för att flagga phishing, spoofing och bluffmejl – innan du hinner klicka fel.

---

## Deltagare

| Namn | Ansvar |
|------|--------|
| **Laith** | Backend (Express, Google OAuth, Gmail API), AI-integration (OpenAI), deployment på Railway, säkerhetslösningar |
| **Abbas** | Frontend (landningssida, dashboard-design), användarflöde, manuell testning och användartester |

---

## Beskrivning

Sentinel skapades för att lösa ett verkligt problem – nätfiske och bluffmejl är ett av de vanligaste sätten folk blir lurade på nätet, och de flesta e-postklienter gör inte tillräckligt för att stoppa dem.

Appen fungerar så här: du loggar in med ditt Google-konto, godkänner att appen får läsa dina mejl (read-only), och sedan kör AI:n igenom dina senaste meddelanden och ger varje mejl en risknivå: **Låg**, **Medel** eller **Hög**. Hög risk betyder att mejlet troligtvis är ett försök till phishing eller scam.

Tekniskt sett bygger appen på en Node.js/Express-backend, Google OAuth 2.0 för inloggning, Gmail API för att hämta mejlen, och OpenAI:s API för att analysera innehållet. Hela appen är deployad på Railway med Docker.

---

## Kom igång

### Förutsättningar

- Node.js 18+
- Ett Google Cloud-projekt med Gmail API aktiverat
- En OpenAI API-nyckel
- npm

### Installation

Klona repot och installera beroenden:

```bash
git clone https://github.com/ditt-repo/sentinel.git
cd sentinel/server
npm install
```

### Konfigurera miljövariabler

Skapa en fil som heter `.env` inuti mappen `server/` och fyll i följande:

```
OPENAI_API_KEY=din-openai-nyckel
PORT=3000
GOOGLE_CLIENT_ID=din-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=din-client-secret
SESSION_SECRET=valfri-hemlig-sträng
```

### Konfigurera Google OAuth

1. Gå till [Google Cloud Console](https://console.cloud.google.com)
2. Skapa ett projekt → APIs & Services → Credentials → OAuth client ID
3. Välj **Web application** som typ
4. Lägg till denna redirect URI: `http://localhost:3000/auth/google/callback`
5. Aktivera **Gmail API** under APIs & Services → Library
6. Om appen är i testläge: lägg till din Gmail-adress under OAuth consent screen → Test users

### Köra programmet

```bash
cd server
npm start
```

Öppna sedan `http://localhost:3000` i webbläsaren.

**Steg-för-steg:**
1. Klicka på "Logga in med Google" på startsidan
2. Godkänn åtkomst till Gmail (appen läser bara, skriver ingenting)
3. Du kommer till dashboarden där dina mejl analyseras
4. Varje mejl får en risknivå – Låg / Medel / Hög

---

## Projektstruktur

```
sentinel/
├── server/
│   ├── server.js          # Huvudservern – Express, OAuth, Gmail API, AI-logik
│   ├── public/
│   │   ├── index.html     # Landningssida och login
│   │   └── dashboard.html # Mejlanalys och riskvyer
│   ├── .env               # Miljövariabler (läggs inte upp på GitHub)
│   └── package.json
├── extension/             # Chrome-extension (valfri del av projektet)
├── website/               # Statisk landningssida
├── Dockerfile
└── README.md
```

---

## Säkerhet

- Appen använder Google OAuth 2.0 – vi lagrar aldrig användarens lösenord
- Gmail-åtkomsten är **read-only** – appen kan inte skicka, radera eller ändra mejl
- API-nycklar och hemliga strängar lagras i `.env` och finns inte i repot (se `.gitignore`)
- Sessions hanteras server-side med en slumpmässig SESSION_SECRET
- På Railway används miljövariabler direkt via deras dashboard – inga känsliga filer i produktionsmiljön

---

## Testning

Testning skedde i två steg:

**Kodtester:** Vi testade OAuth-flödet manuellt med olika Gmail-konton och verifierade att API-anropen returnerade rätt data. Vi testade även edge cases som mejl utan ämnesrad och mejl på andra språk.

**Användartester:** Vi lät tre personer utanför projektet testa appen. Feedback ledde till att vi förtydligade login-knappen och lade till en laddningsindikator under AI-analysen.

Åtgärdslista efter användartester:
- [x] Lade till loading-spinner under analys
- [x] Förtydligade vad "read-only" innebär på landningssidan
- [ ] Mobilanpassning av dashboard (planerat i nästa sprint)

---

## Skalbarhet

Just nu analyseras mejl manuellt när användaren begär det. Framöver skulle appen kunna:

- Köra automatiska analyser i bakgrunden med schemalagda jobb
- Stödja fler e-posttjänster (Outlook, Yahoo)
- Spara historik i en databas (t.ex. PostgreSQL) så användaren kan se trender
- Lägga till notiser – t.ex. push eller SMS – när ett högrisk-mejl dyker upp
- Bygga ut Chrome-extensionen så analysen sker direkt i Gmail-gränssnittet

---

## Externt material

- 📋 [Trello – Projektplanering & Backlog](#) *(lägg in länk här)*
- 🎨 [Figma – Prototyp & Design](#) *(lägg in länk här)*
- 📁 [Google Drive – Dokumentation & Loggböcker](#) *(lägg in länk här)*
- 🚀 [Railway – Live deployment](https://sentinel.up.railway.app) *(uppdatera med rätt URL)*

