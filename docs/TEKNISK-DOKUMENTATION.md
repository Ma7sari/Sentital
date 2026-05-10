# Teknisk dokumentation – Sentinel

Vi skriver det här så någon som inte orkar läsa hela serverfilen ändå fattar ungefär hur det hänger ihop.

**Arkitektur**

Webbläsaren pratar med en Express-server i Node.js version 20. Inloggning sker via Google OAuth 2.0. Mejl hämtas med Gmail API. Analysen gör OpenAI, modellen vi använder heter gpt-4o-mini. Sessioner ligger i minnet via express-session, vilket betyder att vi inte har någon databas i den här versionen. Om servern startar om kan man bli utloggad – det är en känd begränsning. Frontend är vanlig HTML, CSS och JavaScript i public-mappen, vi valde medvetet bort React för att hålla projektet rimligt för kursen. Det finns också ett Chrome-tillägg i extension-mappen som kan analysera webbsidor och prata med samma server, men det är ett sidospår.

**Miljövariabler man behöver ha koll på**

PORT sätter Railway oftast själv, lokalt kan man sätta 3000. SESSION_SECRET ska vara något långt och slumpat i produktion. GOOGLE_CLIENT_ID och GOOGLE_CLIENT_SECRET måste komma från en klient av typen "Web application" i Google Cloud, inte någon annan typ – det är en vanlig källa till förvirring. GOOGLE_REDIRECT_URI i miljön måste vara exakt samma URL som man lagt in i Google Console, inklusive https och path, annars klagar Google. OPENAI_API_KEY behövs för AI-delen, saknas den startar servern ändå men AI-rutter svarar med ett felmeddelande. DEV_LOGIN_SECRET är ett valfritt dev-lösenord för testinlogg utan Google, det ska man inte lämna aktivt i en öppen produktion.

**Rutter**

Startsidan, registrering, login och demo är öppna för alla. Health-sidan är öppen och visar om servern lever och om nycklarna finns. Auth/google och auth/google/callback är OAuth-flödet. Dashboard, monitor och protected kräver att man är inloggad, annars skickas man tillbaka. api/auth/me svarar med vem som är inloggad. api/gmail/emails listar mejl eller mock-data. api/gmail/scan tar emot en POST med hur många mejl man vill skanna och kör AI på dem. analyze och analyze-email finns för extension-flödet.

Felkoder i korthet: 401 om man inte är inloggad och försöker nå ett API, 400 om Gmail inte är kopplat, 503 om OpenAI-nyckeln saknas.

**Flöden**

Inloggning med Google: användaren går till /auth/google, Google skickar tillbaka till vår callback-URL med en kod, servern byter koden mot tokens och hämtar användarinfo, sedan sparas allt i sessionen.

Skanning: den inloggade klienten skickar en POST till /api/gmail/scan. Servern hämtar mejl via Gmail API, eller kör på fejkade exempelmejl om man är i demo-läge. Varje mejl paketeras som en fråga till OpenAI och svaret skickas tillbaka till klienten med en risknivå.

**Säkerhet**

Vi sparar aldrig användarens Google-lösenord, bara OAuth-tokens i sessionen. Cookie-inställningarna är httpOnly och secure i produktion. Vi sätter trust proxy eftersom Railway sitter bakom en load balancer, annars kan sessioner bete sig konstigt med HTTPS. Dev-lösenordet jämförs på ett sätt som inte läcker information via svarstid. Env-filen är med i gitignore.

**Begränsningar vi är medvetna om**

Ingen databas innebär ingen historik per användare, och om man kör flera serverinstanser utan sticky sessions kan folk bli utloggade slumpmässigt. Tester är manuella, se testrapporten. Mer om vad vi skulle gjort vidare finns under skalbarhet i README.
