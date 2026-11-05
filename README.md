# Flokkboka

Digitalt arkiv for sau, geit, storfe, hund og hest. Registrer individer med individdata, koble mor og far, før hendelser og observasjoner (også felles for flere dyr), importer besetningen fra Excel, og ta ut individ-, relasjons- og besetningsrapporter (PDF, CSV og utskrift).

Løsningen er en statisk nettside (HTML/CSS/JavaScript uten byggesteg) som kan publiseres på **GitHub Pages**, med **Supabase** som database, innlogging og bildelagring.

## Funksjoner

- **Dyreslag**: sau, geit, storfe, hund og hest. Hvert slag har egne kjønnsbetegnelser (søye/vær, geit/bukk, ku/okse/kastrat, tispe/hannhund, hoppe/hingst/vallak), egne felt og hendelsestyper, og en liste over de vanligste rasene i Norge. Storfe har blant annet kalving, inseminering, drektighetsundersøkelse, tørrlegging, melkekontroll, celletall, holdvurdering, medisinsk behandling, slaktevurdering og melding til Husdyrregisteret.
- **Individer**: ID-nr (øremerke, NKK-reg.nr eller UELN), navn, kjønn, fødselsdato, rase, farge, status med dato, bilde og artsspesifikke felt.
- **Relasjoner**: mor og far velges blant dyr av riktig art og kjønn. Avkom, helsøsken og halvsøsken vises automatisk. Databasen stopper ugyldige koblinger, som feil kjønn, feil art eller et dyr som blir sin egen forfar.
- **Hendelser og observasjoner**: veiing, fødsel, vaksinering, klipping, hovslager, gjeterprøve med mer. Hver hendelse har dato, en eventuell måleverdi og fritekst.
- **Felles observasjon**: velg flere aktive individer i ett arkiv (med filter for kjønn, alder og søk). Når du trykker Registrer, lagres observasjonen på hvert valgte individ. Hendelsene er merket som felles og viser hvor mange dyr de gjaldt.
- **Filtre som oppdateres med en gang**: dyreslag, kjønn, status, rase, fødselsår, arkiv, søk og sortering. Tellere og antall oppdateres mens du velger, og valgene huskes til neste gang.
- **Rapporter**:
  - *Individrapport* med individdata og alle hendelser.
  - *Relasjonsrapport* med stamtavle over tre generasjoner, avkom og søsken, og innavlsvarsel ved felles aner.
  - *Besetningsrapport* per dyreslag for et valgt tidsrom. Den tar med alle individer som var aktive i perioden, og viser antall ved start og slutt, fødte og avgang, samt hendelser i perioden.
  - Valg for å ta med bilde av individet i rapportene, og eget valg for bilder av far, mor, aner, avkom og søsken. Valgene gjelder både på skjerm, i PDF og ved utskrift.
  - Nedlasting som PDF og CSV, og utskrift. Arkivlisten og alle hendelser kan også eksporteres som CSV.
- **Import fra Excel**:
  - Last ned en mal per dyreslag, tom eller fylt med dyrene som allerede ligger i arkivet.
  - Malen har tre ark. «Besetning» er for dataene. «Veiledning» forklarer hver kolonne, hva som er påkrevd og gyldige verdier. «Gyldige verdier» lister kjønn, status, raser og valgfelt.
  - Ved import kontrolleres hver rad før noe lagres. Du ser hvilke rader som blir nye, hvilke som oppdateres, og hvilke som har feil.
  - Mor og far kobles via ID-nr, enten til dyr i samme fil eller til dyr som allerede ligger i Flokkboka.
- **Hjem og favoritter**: merk dyr som favoritter. Hjem-siden viser dem med bilde, siste vekt og siste hendelse, og har knapp for å registrere en ny hendelse direkte.
- **Snarvei på telefonen**: Flokkboka kan legges på hjemskjermen som app. Snarvei-knappen på et dyr gir siden dyrets navn og bilde, slik at dyret kan ligge som egen snarvei. Lenken `?vis=<id>` åpner dyret direkte.
- **Deling i sosiale medier**: eieren kan lage en offentlig profilside for et dyr og velge hvilke opplysninger som vises: bilde, rase, alder, foreldre, resultater og besetningsnavn. Siden kan deles på Facebook, X, LinkedIn, WhatsApp, e-post eller via telefonens deleknapp. Det finnes også et ferdig delingsbilde (1080×1350) for Instagram og TikTok. Profilsiden har en knapp for å registrere seg, og brukere som kommer den veien blir merket slik at superadmin kan følge med.
- **Besetningsdata**: besetnings- eller gårdsnavn, type dyrehold, ansvarlig, organisasjonsnummer (med kontroll av kontrollsiffer), produsentnummer, adresse, kommune, gnr/bnr, kontaktinfo, fast veterinær, helseprogram og medlemsnummer i Saue-, Geite- og Kukontrollen. I tillegg kennelnavn, stallnavn, beitelag og forsikring. Opplysningene vises i besetningsrapporten.
- **Medeiere**: hovedeier kan invitere inntil 5 familiemedlemmer som medeiere. De får samme rettigheter som hovedeier: registrere, endre og slette dyr, redigere besetningsdata og dele arkivet. Bare hovedeier legger til og fjerner medeiere. Personer uten konto får en invitasjonslenke, og blir medeier automatisk når de registrerer seg.
- **Roller**:
  - *Superadmin*: ser hele plattformen. Det gjelder brukere og arkiv, arkivstørrelse, fordeling på dyreslag, aktivitet per måned, databasestørrelse, bildelagring og databaseaktivitet. Superadmin følger opp brukere med aktivitetsstatus (aktiv, sovende, inaktiv, aldri aktiv, ubekreftet, stengt) og oppfølgingsstatus med notat og neste kontaktdato. Plattformrapporten kan lastes ned som PDF, og bruker- og arkivlister som CSV.
  - *Administrator*: brukerstøtte. Ser alle arkiv og brukere, stenger og åpner kontoer, og kan følge opp brukere.
  - *Bruker*: eier sitt eget arkiv.
  - Den første som registrerer seg, blir automatisk superadmin. Det må alltid finnes minst én aktiv superadmin, og bare en superadmin kan gi eller fjerne superadmin-rollen.
- **Deling**: en bruker kan dele arkivet sitt med andre brukere på e-post.
  - *Kan lese*: mottakeren ser dyr, relasjoner, hendelser og rapporter.
  - *Kan registrere og endre*: mottakeren kan også legge til og endre dyr og hendelser, registrere felles observasjoner og importere, men ikke slette dyr.
  - Mottakeren kan selv forlate en deling.
  - Personer uten konto kan inviteres med lenke.
- **Sikkerhet**: all tilgang håndheves i databasen med Row Level Security, ikke bare i nettleseren. En bruker kan ikke gi seg selv administratorrolle, og det må alltid finnes minst én aktiv administrator.
- **Utvidbart**: nye dyreslag legges til i `assets/arter.js`. Artsspesifikke felt lagres i kolonnen `ekstra` (jsonb), så databasen trenger ingen endring.

## Filstruktur

```
index.html                         Appens side
config.js                          Supabase-URL og anon-nøkkel (fylles inn)
assets/app.js                      Applogikk
assets/arter.js                    Dyreslag, felt, raser og hendelsestyper
assets/style.css                   Stil (lys og mørk modus, mobil og PC, utskrift)
assets/ikon.svg                    Ikon
assets/ikoner/                     App-ikoner for hjemskjerm (PWA)
manifest.webmanifest               Gjør Flokkboka installerbar på telefon og PC
supabase/schema.sql                Hele databasen: tabeller, roller, deling, tilgangsregler og bildelagring
```

## Oppgradere en eksisterende installasjon

Har du allerede Flokkboka i drift:

1. Kjør hele `supabase/schema.sql` på nytt i Supabase SQL Editor. Den er laget for å kjøres flere ganger. Den legger til nye tabeller og felt og sletter ingen data. Den eldste administratoren blir automatisk superadmin.
2. Erstatt `index.html`, `manifest.webmanifest` og alt i `assets/` i GitHub-repoet med de nye filene. Behold din egen `config.js`, men legg til linjen `grenser` fra den nye `config.js` hvis du vil styre målerne i superadmin-oversikten.

## Oppsett

### 1. Opprett Supabase-prosjekt

1. Gå til [supabase.com](https://supabase.com) og opprett et nytt prosjekt. Region *West EU (Ireland)* eller *Central EU (Frankfurt)* holder dataene i EU.
2. Åpne **SQL Editor → New query**, lim inn hele `supabase/schema.sql` og trykk **Run**.
   Filen kan kjøres på nytt senere uten å slette data.
3. Gå til **Project Settings → API** og kopier:
   - **Project URL**
   - **anon public**-nøkkelen

### 2. Fyll inn `config.js`

```js
window.FLOKKBOKA_CONFIG = {
  supabaseUrl: "https://abcdefgh.supabase.co",
  supabaseAnonKey: "eyJhbGciOi..."
};
```

Anon-nøkkelen er laget for å ligge i nettleseren. Tilgangen styres av reglene i databasen. Legg **aldri** inn `service_role`-nøkkelen.

### 3. Publiser på GitHub Pages

1. Opprett et repository på GitHub, for eksempel `flokkboka`, og last opp alle filene. Med git:
   ```bash
   git init
   git add .
   git commit -m "Flokkboka"
   git branch -M main
   git remote add origin https://github.com/BRUKERNAVN/flokkboka.git
   git push -u origin main
   ```
2. I repoet: **Settings → Pages → Build and deployment**.
3. Velg *Deploy from a branch*, deretter branch `main`, mappe `/ (root)`, og lagre.
4. Etter et minutt eller to ligger appen på `https://BRUKERNAVN.github.io/flokkboka/`.

### 4. Koble innlogging til nettadressen

I Supabase: **Authentication → URL Configuration**

- **Site URL**: `https://BRUKERNAVN.github.io/flokkboka/`
- **Redirect URLs**: legg til samme adresse. Ved lokal testing legger du også til `http://localhost:8000/`.

Dette gjør at lenkene i e-postene for bekreftelse og nytt passord går tilbake til appen.

Vil du slippe e-postbekreftelse under testing, slår du av **Authentication → Providers → Email → Confirm email**.

### 5. Første innlogging

1. Åpne appen og velg **Opprett konto**. Den første kontoen blir administrator.
2. Andre brukere oppretter egne kontoer og får rollen *Bruker*.
3. Administrator kan gjøre andre til administrator under **Admin**.

Har du låst deg ute som administrator, kan du gi en konto rollen tilbake i SQL Editor:

```sql
update public.profiles set rolle = 'admin', aktiv = true where epost = 'din@epost.no';
```

## Kjøre lokalt

Appen må serveres over http (ikke åpnes som fil):

```bash
python3 -m http.server 8000
```

Åpne deretter `http://localhost:8000/`.

## Importere besetning fra Excel

1. Velg **Importer fra Excel** i arkivet.
2. Velg arkiv og dyreslag, og last ned malen. Kryss av for å fylle malen med dyrene du allerede har, hvis du vil redigere dem i Excel.
3. Fyll inn ett individ per rad i arket «Besetning». Ikke endre overskriftene.
4. Last opp filen, kontroller forhåndsvisningen og trykk **Importer**.

**Påkrevde kolonner** (merket * i malen):

| Kolonne | Innhold |
|---------|---------|
| ID-nr   | Øremerke, NKK-reg.nr eller UELN. Unikt per dyreslag i arkivet, og brukes til å koble foreldre. |
| Kjønn   | Artens betegnelse (f.eks. Søye/Vær, Geit/Bukk, Tispe/Hannhund, Hoppe/Hingst/Vallak) eller Hunn/Hann. |

Alle andre kolonner er valgfrie:

- **Dyreslag**: tom celle betyr dyreslaget malen er laget for.
- **Datoer**: `dd.mm.åååå` eller `åååå-mm-dd`, eller ekte Excel-datoer.
- **Mor ID-nr og Far ID-nr**: kan peke på dyr i samme fil eller dyr som allerede ligger i Flokkboka.

Finnes ID-nr fra før i arkivet, oppdateres individet. Tomme celler endrer ikke verdier som allerede er lagret.

## Legge til et nytt dyreslag

Kopier en blokk i `assets/arter.js` og tilpass den, for eksempel `gris`:

```js
gris: {
  navn: "Gris", ikon: "Gr", idLabel: "Øremerke-nr", idEksempel: "f.eks. NO 1234 0001",
  hunn: "Purke", hann: "Råne", ung: "Smågris", hunnP: "Purker", hannP: "Råner", ungP: "Smågris",
  morL: "Mor (purke)", farL: "Far (råne)",
  raser: ["Norsk landsvin", "Duroc", "Kryssing"],
  statuser: ["Aktiv", "Solgt", "Slaktet", "Død"],
  ekstra: [{ k: "fodselsvekt", l: "Fødselsvekt (kg)", type: "number" }],
  hendelser: [{ n: "Veiing", v: "Vekt (kg)" }, { n: "Grising", v: "Antall smågris" }, { n: "Observasjon", obs: true }]
}
```

Det nye slaget kommer automatisk med i filtre, felles observasjon, rapporter, Excel-maler, offentlige profiler og superadmin-statistikk. Databasen trenger ingen endring.

## Power BI og Excel

- **CSV**: CSV-eksporten fra **Rapporter** bruker semikolon og UTF-8, og kan åpnes direkte i Excel eller lastes inn i Power BI.
- **Direkte kobling**: vil du koble Power BI rett til databasen, finner du en valgfri lesebruker nederst i `schema.sql` (seksjon 7).

## Datamodell

| Tabell      | Innhold |
|-------------|---------|
| `profiles`  | Én rad per bruker: navn, e-post, rolle (`admin`/`bruker`), aktiv |
| `dyr`       | Individer med `eier_id`, `mor_id`, `far_id`, artsspesifikke felt i `ekstra` |
| `hendelser` | Hendelser og observasjoner knyttet til `dyr_id`; `felles_id` binder sammen felles observasjoner |
| `delinger`  | `eier_id` deler arkivet med `mottaker_id`, med tilgang `les`, `skriv` eller `medeier` |
| `arkiv`     | Besetningsdata per hovedeier (navn, org.nr, produsentnr, adresse, registreringer) |
| `invitasjoner` | Invitasjoner med lenke-token til personer uten konto |
| `favoritter` | Hver brukers favorittdyr |
| `bruker_oppfolging` | Superadmins/administrators oppfølging av brukere |

Bilder ligger i den private bøtta `dyrebilder` under `<eier_id>/…` og vises med tidsbegrensede lenker.

## Kjente begrensninger

- **Forhåndsvisning i sosiale medier**: GitHub Pages er en statisk side, så forhåndsvisningen viser Flokkbokas generelle tittel og ikon, ikke bildet av dyret. Bruk delingsbildet når du vil vise fram bildet. Forhåndsvisning med dyrets eget bilde krever en liten server som lager sidehodet, for eksempel på eget domene.
- **Snarvei per dyr**: Navn og bilde på snarveien bestemmes av telefonen. De fleste Android-telefoner bruker dyrets navn og bilde. iPhone kan bruke Flokkbokas ikon, men snarveien åpner likevel riktig dyr.
- **Compute og båndbredde**: Supabase lagrer ikke compute-timer og egress i databasen. Superadmin-oversikten lenker til Supabase-dashbordet for disse tallene.
- **Store plattformer**: Administratorer laster alle arkiv i nettleseren. Det fungerer godt for noen tusen dyr. Ved mye større volum bør listene hentes side for side.
