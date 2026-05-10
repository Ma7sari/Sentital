# Hur vi jobbade – agil metodik

Vi körde inte perfekt Scrum. Vi är inte Spotify. Men vi jobbade i korta perioder och pratade om vad som måste vara klart och vad som kan vänta. Vi har inte haft Trello eller liknande med allt uppskrivet – prioritering sköttes muntligt och i chatt, och git-historiken visar ganska bra vad som gjorts när.

Här är en genomgång per period så läraren kan följa hur vi tänkte, utan att vi behöver länka till externa verktyg vi aldrig använde.

**Första perioden – grund och inloggning**

Vi startade med att sätta upp Express och en landningssida och sen försöka få Google OAuth att funka. Det lät enkelt men Google Cloud gav oss huvudvärk. Vi hade fel typ av klient (Chrome extension istället för Web application), sedan hade vi en extra bokstav i callback-URL:en, och sen visste vi inte att vi behövde lägga till vår Gmail-adress som testanvändare. Det löste vi steg för steg. Vi bestämde att vi inte borde gå vidare till Gmail API förrän inlogg faktiskt fungade.

Retro: det var bra att vi bestämde oss för att inte gå vidare förrän OAuth faktiskt fungade. Nästa gång skriver vi ner felmeddelanden direkt så vi inte googlar exakt samma sak tre gånger.

**Andra perioden – Gmail och AI**

När inlogget fungade kopplade vi Gmail API och lade in OpenAI-anrop. Tanken var att varje mejl ska bli en fråga till AI:n som svarar med risknivå. Vi la också in demo-läge så man kan testa appen utan att ha en riktig Gmail kopplad. Vi beslutade tidigt att OpenAI-nyckel inte skulle krävas för att servern ska starta – annars kraschade den varje gång vi inte hade nyckel satt.

Retro: AI:n var bättre än vi trodde på att hitta mönster i mejl. Vi borde ha testat mer mot verkliga mejl tidigare i projektet.

**Tredje perioden – UX, deploy och användartester**

Den sista perioden handlade om att göra flödet vettigare för en vanlig användare. Vi lade till sidor i onboarding-flödet, förbättrade dashboard, deployade på Railway med Docker, och lät tre personer utanför gruppen testa och ge feedback. Vi bestämde oss för att dela upp inlogg-knapparna på registreringssidan tydligare och lägga till en laddningsindikator under skanning. Laith tog mer ansvar för backend och deploy, Abbas mer för hur sidor ser ut och för att koordinera användartesterna.

Vi designade inte i Figma – vi jobbade direkt i webbläsaren och justerade CSS medan vi såg hur det såg ut. Det funkar bra för ett projekt i den här storleken.

Retro: uppdelningen av ansvar fungerande bra. Nästa projekt kan vi testa Figma om kursen kräver det tydligare, men det passade inte vår stil den här gången.

**Kvar på önskelistan**

Bättre mobilanpassning av dashboard, mer arbete med Chrome-tillägget, och en databas om man vill spara historik. Vi räknade något som klart när README stämde, inga nycklar låg i Git, och vi klickat igenom huvudflödet efter större ändringar utan att det kraschat.
