# Testrapport – Sentinel

Laith och Abbas, vårterminen 2026.

Vi har inte skrivit automatiska Jest- eller Cypress-tester. Vi hade inte tid och kursen handlade mer om att appen faktiskt funkar. Vi testade för hand och lät tre personer utanför gruppen prova. Det tycker vi är ärligare än att låtsas att vi har massa automatiska tester.

**Vad vi kollade i koden**

Vi gick igenom dessa saker löpande under projektet, framför allt efter större ändringar:

Att health-sidan svarar efter deploy – det var det snabbaste sättet att se att servern faktiskt levde. Att Google-inloggning fungerade med rätt Client ID och redirect-URL – det tog ett tag att få rätt, vi hade fel typ av OAuth-klient och råkade ha en extra bokstav i callback-länken en gång. Att man hamnar tillbaka på sidan med ett felmeddelande om man avbryter hos Google. Att man nekas och skickas tillbaka om man försöker skanna utan att vara inloggad. Att skanning med riktig Gmail funkar när kontot är med som test user och man godkänt rätt behörighet. Att man får ett tydligt felmeddelande på svenska om OpenAI-nyckeln saknas på servern. Att inlogg via dev-lösenord funkar som reserv när Google krånglar. Att demo-läget med påhittade mejl funkar. Vi testade också mejl med tomt ämne och kort text – AI:n svarar ändå något, men vi har inte kört några hårda gränstester mot API-begränsningar eller liknande.

**Användartester**

Tre personer utanför gruppen fick testa appen. Vi bad dem säga vad de tänkte medan de klickade, och ställde några frågor efteråt.

Den första personen tyckte att "read-only" lät bra men var otydligt vad det faktiskt innebar i praktiken. Vi uppdaterade texten på landningssidan för att förklara det tydligare.

Den andra personen visste inte om analysen höll på – allt såg stilla ut ett bra tag och det var oklart om något hände. Vi lade in en tydligare laddningsindikator medan appen skannar mejl.

Den tredje personen gillade färgkodningen för risk men tyckte dashboard kändes tight och lite trång på mobil. Det har vi inte hunnit fixa ordentligt till deadline, det är kvar som förbättring.

**Vad vi ändrade efter testerna**

Vi förtydligade vad read-only innebär, lade till tydligare laddning under skanning, och delade upp knapparna på registreringssidan så "Fortsätt" och "Logga in med Google" var tydligare separerade. Mobilanpassning av dashboard hann vi inte med.

**Vad vi inte gjort**

Vi har inte kört stresstester med många användare samtidigt, inte testat Gmail-kvoter eller OpenAI-kostnad vid hög belastning, och inga automatiska end-to-end-tester som körs i CI. Det får bli framtida arbete om projektet lever vidare.
