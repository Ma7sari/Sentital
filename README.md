# Sentinel – AI-skydd mot e-postbedrägerier

Webbapp där användare kan koppla Gmail och få AI-analys av sina mejl för att upptäcka phishing, spoofing och scam.

## Snabbstart

### 1. Installera beroenden

```bash
cd server
npm install
```

### 2. Konfigurera Google OAuth (för webb)

Du behöver en **Web application** OAuth-klient (inte Chrome extension):

1. Gå till [Google Cloud Console](https://console.cloud.google.com/) → ditt projekt
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
3. Välj **Application type: Web application**
4. Lägg till **Authorized redirect URI**: `http://localhost:3000/auth/google/callback`
5. Kopiera **Client ID** och **Client secret**

### 3. Sätt miljövariabler

Skapa/redigera `server/.env`:

```
OPENAI_API_KEY=din-openai-nyckel
PORT=3000

GOOGLE_CLIENT_ID=din-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=din-client-secret
SESSION_SECRET=valfri-hemlig-strang

# Valfritt: lösenord för /login (test utan Google). Lämna tom i produktion om du inte behöver det.
# DEV_LOGIN_SECRET=starkt-hemligt-lösenord
```

### 4. Aktivera Gmail API

1. Gå till [APIs & Services → Library](https://console.cloud.google.com/apis/library)
2. Sök **Gmail API** → klicka **Enable**

### 5. Lägg till testanvändare (om appen är i Testing)

OAuth consent screen → Test users → Add users → din Gmail-adress

### 6. Starta servern

```bash
cd server
npm start
```

Öppna [http://localhost:3000](http://localhost:3000) i webbläsaren.

## Deploy på Railway

Railpack hittar ofta inget Node-projekt i roten om bara `server/` har `package.json`. Det här repot har nu:

- **`Dockerfile`** i roten – sätt i Railway **Root Directory** till `.` (repo root) så byggs containern från `server/`.
- Alternativ: sätt **Root Directory** till `server` och **Start Command** till `node server.js` (ingen Docker).

**Miljövariabler på Railway** (Variables):

| Variabel | Beskrivning |
|----------|-------------|
| `OPENAI_API_KEY` | **Obligatorisk** för mejl-/sidanalys. Skapa på [platform.openai.com](https://platform.openai.com/api-keys) |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Web OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://DIN-APP.up.railway.app/auth/google/callback` |
| `SESSION_SECRET` | Lång slumpmässig sträng |
| `DEV_LOGIN_SECRET` | Valfritt: aktiverar `/login` för test utan Google (fictiva mejl). **Ta bort eller lämna tom** när du bara vill ha riktig OAuth. |

Lägg samma redirect-URL i Google Cloud → OAuth client → Authorized redirect URIs.

## Flöde

1. **Startsida** – Klicka "Logga in med Google"
2. **Google** – Godkänn åtkomst till Gmail (readonly)
3. **Dashboard** – Skanna dina mejl, se risknivåer (Låg/Medel/Hög)

## Projektstruktur

```
extension-main/
├── server/
│   ├── server.js      # Express + OAuth + Gmail API + AI
│   ├── public/
│   │   ├── index.html # Landningssida + login
│   │   └── dashboard.html
│   ├── .env
│   └── package.json
├── extension/         # Chrome extension (valfritt)
└── website/           # Statisk landningssida (valfritt)
```
