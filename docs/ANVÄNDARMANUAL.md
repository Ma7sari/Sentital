# Användarmanual – Sentinel

Hej. Här förklarar vi hur man startar och använder appen, utan att man behöver läsa koden.

Sentinel är vår skolapp som hjälper dig se om mejl kan vara phishing eller bluff. Du kopplar Gmail, appen får bara läsa – den skickar inget och raderar inget. Sen får du en ungefärlig risknivå per mejl: låg, medel eller hög. Det är ett stöd, inte en juridisk sanning.

**Testa live**

Den deployade versionen finns på: https://sentital-production.up.railway.app

Öppna länken i webbläsaren och börja med registreringssidan.

**Testa lokalt**

Följ installationsinstruktionerna i README. I korthet: klona repot, gå in i server-mappen, kör npm install och sen npm start. Öppna sedan http://localhost:3000 i webbläsaren.

**Registrering och inlogg**

Fyll i namn, telefon och mejl på registreringssidan. Sen har du två vägar:

Väljer du "Fortsätt" hamnar du på vår testsida där du loggar in med ett hemligt lösenord som vi satt i miljön på servern. Det är ett sätt att testa appen utan att Google OAuth behöver funka. Kontakta oss om du vill ha lösenordet.

Väljer du "Logga in med Google-konto" går du igenom Googles vanliga OAuth-flöde och godkänner att appen får läsa din Gmail. Det är det normala sättet att använda appen på riktigt.

**På dashboarden**

När du är inloggad klickar du igenom ett par informationssidor om hur appen fungerar. Sen hamnar du på dashboard. Där väljer du hur många mejl som ska skannas och trycker skanna. Resultatet visar avsändare, ämne och vad AI:n skriver om varje mejl. Färgerna visar risknivå: grönt är låg, orange är medel och rött är hög.

Logga ut-knappen finns uppe i hörnet när du är inne.

**Demo-läge**

Om du inte vill koppla Gmail kan du gå till startsidan och välja demo, eller gå direkt till adressen /demo. Då får du se appen med påhittade exempelmejl istället för din riktiga inkorg.

**Om du är lärare eller teknisk granskare**

All teknisk setup finns i README. Efter deploy kan du öppna /health i webbläsaren för att se att servern lever och vilka nycklar som är konfigurerade. Mer om hur rutter och miljövariabler fungerar finns i docs/TEKNISK-DOKUMENTATION.md.

**Vanliga fel och vad de beror på**

Om Google säger att klienten inte finns är det nästan alltid fel Client ID eller fel typ av app i Google Cloud – typen ska vara "Web application". Om det står "redirect_uri_mismatch" måste URL:en i Google Console och i Railway-miljön vara exakt likadana, inklusive https och hela pathen. Om ingen AI-analys visas saknas OpenAI-nyckeln på servern. Om testsidan säger att inlogg inte är aktiverat saknas dev-lösenordet i miljön.

/Laith och Abbas
