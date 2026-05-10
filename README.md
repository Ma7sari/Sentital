# Sentinel – AI-skydd mot e-postbedrägerier

En webbapp där du kopplar ihop ditt Gmail-konto och låter AI:n gå igenom dina mejl för att flagga phishing, spoofing och bluffmejl – innan du hinner klicka fel.

---

## Innehållsförteckning

Mer detaljer ligger i mappen docs så den här filen inte blir för lång.

- [Teknisk dokumentation](docs/TEKNISK-DOKUMENTATION.md) – hur det hänger ihop  
- [Testrapport](docs/TESTRAPPORT.md) – vad vi testat och användartester  
- [Hur vi jobbade (agilt)](docs/AGIL-PROCESS.md)  
- [Användarmanual](docs/ANVÄNDARMANUAL.md)  
- [Var loggbok och backlog ska ligga](docs/VAR-LIGGER-VAD.md) – GitHub vs Google Drive m.m.

Trello, Figma och Drive: vi har **inte** haft separata länkar dit. Vi har skrivit kort i docs och fokuserat på kod och test. Se **docs/VAR-LIGGER-VAD.md** om ni undrar var processen finns.

---

## Deltagare

**Laith** har mest backend: Express, Google OAuth, Gmail API, OpenAI, Railway och säkerhet runt det. Samtidigt också tester ifall allting funkar som det ska.

**Abbas** har mest frontend: landningssida, dashboard, flöde för användaren, och han har kört mycket av testningen med folk utanför gruppen för att kolla hur folk reagerar och beteende för hemsidan.

---

## Beskrivning

Idén kom från att nätfiske och bluffmejl faktiskt lurar folk hela tiden – och många märker inte ens att något ser suspekt ut förrän det är försent.

Så funkar Sentinel i praktiken: du loggar in med Google och ger appen läsbehörighet till din Gmail (den får alltså inte skicka eller radera mejl). Sen plockar vi ett gäng av dina senaste mejl och skickar innehåll och lite headers till AI som svarar med en ungefärlig risknivå: låg, medel eller hög. Det är ett stöd – inte en garanti.

På tekniksidan kör vi Node och Express i backend, OAuth mot Google, Gmail API för mejlen och OpenAI för analysen. Vi har deployat på Railway med Docker. Om något är otydligt i koden, läs tekniska dokumentationen i docs-mappen först.

**Live:** https://sentital-production.up.railway.app

---

## Kom igång

### Förutsättningar

- Node.js 20 eller högre
- Ett Google Cloud-projekt med Gmail API aktiverat
- En OpenAI API-nyckel
- npm

### Installation

Klona repot och installera beroenden:

```bash
git clone https://github.com/Ma7sari/Sentital.git
cd Sentital/server
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

# Valfritt: testinloggning utan Google (fictiva exempel-mejl). Lämna tom i ren produktion.
# DEV_LOGIN_SECRET=starkt-hemligt-lösenord
```

### Konfigurera Google OAuth

1. Gå till [Google Cloud Console](https://console.cloud.google.com)
2. Skapa ett projekt, gå till APIs & Services, Credentials, OAuth client ID
3. Välj **Web application** som typ (inte Chrome extension eller annat)
4. Lägg till redirect URI: `http://localhost:3000/auth/google/callback` (och i produktion din Railway-URL, t.ex. `https://din-app.up.railway.app/auth/google/callback`)
5. Sätt samma produktions-URI i miljövariabeln `GOOGLE_REDIRECT_URI` på Railway
6. Aktivera **Gmail API** under APIs & Services, Library
7. Om appen är i testläge: lägg till din Gmail-adress under OAuth consent screen, Test users

### Köra programmet

```bash
cd server
npm start
```

Öppna sedan `http://localhost:3000` i webbläsaren.

Steg för steg:

1. Registrera dig och logga in med Google
2. Godkänn åtkomst till Gmail – appen läser bara, skriver ingenting
3. Du kommer till dashboard där du kan skanna mejl
4. Varje mejl får en risknivå: Låg, Medel eller Hög

Utan fungerande Google OAuth kan du använda `/login` med `DEV_LOGIN_SECRET` (se ovan) eller `/demo` för demo-läge med påhittade mejl.

---

## Projektstruktur

```
Sentital/
├── docs/                   # Inlämning: teknisk doc, tester, agilt, manual, checklista
├── server/
│   ├── server.js           # Express, OAuth, Gmail API, AI, sessioner
│   ├── public/
│   │   ├── index.html      # Landningssida
│   │   ├── register.html   # Registreringssteg
│   │   ├── login.html      # Testinloggning (DEV_LOGIN_SECRET)
│   │   ├── monitor.html, protected.html  # Onboarding-flöde
│   │   └── dashboard.html  # Mejlanalys och riskvyer
│   ├── .env                # Miljövariabler (finns inte på GitHub)
│   └── package.json
├── extension/              # Chrome-tillägg (sidanalys m.m.) – valfritt
├── Dockerfile              # Deploy (Railway)
├── package.json            # Root: build/start mot server/
└── README.md
```

---

## Säkerhet

Vi sparar aldrig användarens Google-lösenord – vi ber Google sköta det via OAuth och sparar bara en tillfällig token i sessionen. Gmail-åtkomsten vi begär är read-only, vilket betyder att appen rent tekniskt inte kan skicka eller radera mejl åt någon, det är begränsat på API-nivå.

Alla API-nycklar (OpenAI, Google) och SESSION_SECRET ligger i en `.env`-fil lokalt och i Railway Variables i produktion. Den filen är med i gitignore och finns alltså inte i repot.

Session-cookien är inställd med httpOnly och secure i produktion så att den inte kan läsas av JavaScript i webbläsaren och bara skickas över HTTPS. Vi sätter trust proxy i Express eftersom Railway kör bakom en load balancer, annars kan sessioner bete sig konstigt.

DEV_LOGIN_SECRET är ett testverktyg vi lade in för att kunna logga in när Google OAuth krånglade under utvecklingen. Det är inte tänkt att användas i en öppen produktion.

*(Mer detaljer: se docs/TEKNISK-DOKUMENTATION.md)*

---

## Testning

Vi har kört manuella tester och låtit några utomstående prova (se [docs/TESTRAPPORT.md](docs/TESTRAPPORT.md) för detaljer). Vi hade inte tid att sätta upp Jest eller Cypress på ett sätt som kändes meningsfullt – vi valde ärlighet framför fejkad täckning.

Vi har kollat OAuth-flöde, skannings-API, edge cases med konstiga mejl, och att det failar snyggt om OpenAI-nyckel saknas. Efter användartester förtydligade vi read-only-texten på landningen och lade till tydligare laddning under skanning. Mobilanpassning av dashboard är fortfarande på önskelistan.

---

## Skalbarhet och framtiden

Just nu kör allt i en enda serverprocess utan databas, och användaren måste trycka skanna manuellt. Det var ett medvetet val för att hålla projektet hanterbart under kursen.

Om vi eller någon annan byggde vidare är det mest självklara att lägga till en databas så att analyshistorik sparas per användare. Sedan skulle man kunna schemalägga analyser automatiskt och skicka notis när ett mejl flaggas som hög risk. Chrome-tillägget vi har i repot kan också byggas ut mer och knytas tightare till Gmail-gränssnittet. På sikt kan det vara intressant att stöda fler mejltjänster än Gmail.

Det stora hotet mot skalbarhet just nu är att sessioner ligger i minnet på servern. Kör man fler instanser parallellt kan en användare bli utloggad om en request hamnar på fel instans. Det löser man med sticky sessions eller en session-databas som Redis. Vi räknade det som utanför scope för den här kursen.

---

## Externt material

Kursen nämner ofta Trello, Figma och Google Drive. Vi har inte använt Figma – layout och färger har vi jobbat med direkt i HTML och CSS när vi byggde sidorna. Vi har inte heller lagt upp separata loggböcker eller långa dokument i Google Drive. Istället har vi skrivit kort i mappen docs och använt git-historik och meddelanden när vi planerat. Vi har prioriterat att testa och bygga fungerande kod.

Om fina Jonas vill se mer processdetalj finns det i commits på GitHub, docs/TESTRAPPORT.md (användartester) och docs/AGIL-PROCESS.md (hur veckorna fördelats).

- Huvudbranch ska gå att starta med npm start i server/ med en .env enligt ovan
- **OBS:** vi har ingen Figma/Drive-länk – förklaring under Externt material och i docs/VAR-LIGGER-VAD.md
