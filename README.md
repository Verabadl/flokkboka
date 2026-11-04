# Flokkboka

Digitalt arkiv for sau og hund. Registrer individer med individdata, koble mor og far, før hendelser og observasjoner, og ta ut individ- og relasjonsrapporter (PDF, CSV og utskrift).

Løsningen er en statisk nettside (HTML/CSS/JavaScript uten byggesteg) som kan publiseres på **GitHub Pages**, med **Supabase** som database, innlogging og bildelagring.

## Funksjoner

- **Individer**: øremerke-nr / NKK-reg.nr, navn, kjønn, fødselsdato, rase, farge, status med dato, bilde og artsspesifikke felt (fødselstype og fødselsvekt for sau, chip-nr for hund).
- **Relasjoner**: mor og far velges blant dyr av riktig art og kjønn. Avkom, helsøsken og halvsøsken vises automatisk. Databasen stopper ugyldige koblinger, som feil kjønn, feil art eller et dyr som blir sin egen forfar.
- **Hendelser og observasjoner**: veiing, lamming, vaksinering, klipping, sanking, gjeterprøve, kull med mer. Hver hendelse har dato, en eventuell måleverdi og fritekst.
- **Rapporter**:
  - Individrapport og relasjonsrapport. Relasjonsrapporten har stamtavle over tre generasjoner og innavlsvarsel ved felles aner.
  - Nedlasting som PDF og CSV, og utskrift.
  - Eksport av hele arkivet og alle hendelser som CSV.
- **Roller**:
  - *Administrator*: ser alle arkiv, endrer roller, stenger og åpner brukere, og ser og fjerner alle delinger.
  - *Bruker*: eier sitt eget arkiv.
  - Den første som registrerer seg, blir automatisk administrator.
- **Deling**: en bruker kan dele arkivet sitt med andre brukere på e-post.
  - *Kan lese*: mottakeren ser dyr, relasjoner, hendelser og rapporter.
  - *Kan registrere og endre*: mottakeren kan også legge til og endre dyr og hendelser, men ikke slette dyr.
  - Mottakeren kan selv forlate en deling.
- **Sikkerhet**: all tilgang håndheves i databasen med Row Level Security, ikke bare i nettleseren. En bruker kan ikke gi seg selv administratorrolle, og det må alltid finnes minst én aktiv administrator.
- **Utvidbart**: nye dyreslag legges til i `assets/arter.js`. Artsspesifikke felt lagres i kolonnen `ekstra` (jsonb), så databasen trenger ingen endring.

## Filstruktur

```
index.html            Appens side
config.js             Supabase-URL og anon-nøkkel (fylles inn)
assets/app.js         Applogikk
assets/arter.js       Dyreslag, felt, raser og hendelsestyper
assets/style.css      Stil (lys og mørk modus, mobil og PC, utskrift)
assets/ikon.svg       Ikon
supabase/schema.sql   Tabeller, roller, deling, tilgangsregler og bildelagring
```

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

## Legge til et nytt dyreslag

Kopier en blokk i `assets/arter.js` og tilpass den, for eksempel `geit`:

```js
geit: {
  navn: "Geit", ikon: "G", idLabel: "Øremerke-nr", hunn: "Geit", hann: "Bukk", ung: "Kje",
  morL: "Mor (geit)", farL: "Far (bukk)",
  raser: ["Norsk melkegeit", "Boer", "Kryssing"],
  statuser: ["Aktiv", "Solgt", "Slaktet", "Død"],
  ekstra: [{ k: "fodselsvekt", l: "Fødselsvekt (kg)", type: "number" }],
  hendelser: [{ n: "Veiing", v: "Vekt (kg)" }, { n: "Kjeing", v: "Antall kje" }, { n: "Observasjon", obs: true }]
}
```

Databasen trenger ingen endring.

## Power BI og Excel

- **CSV**: CSV-eksporten fra **Rapporter** bruker semikolon og UTF-8, og kan åpnes direkte i Excel eller lastes inn i Power BI.
- **Direkte kobling**: vil du koble Power BI rett til databasen, finner du en valgfri lesebruker nederst i `schema.sql` (seksjon 7).

## Datamodell

| Tabell      | Innhold |
|-------------|---------|
| `profiles`  | Én rad per bruker: navn, e-post, rolle (`admin`/`bruker`), aktiv |
| `dyr`       | Individer med `eier_id`, `mor_id`, `far_id`, artsspesifikke felt i `ekstra` |
| `hendelser` | Hendelser og observasjoner knyttet til `dyr_id` |
| `delinger`  | `eier_id` deler arkivet med `mottaker_id`, med tilgang `les` eller `skriv` |

Bilder ligger i den private bøtta `dyrebilder` under `<eier_id>/…` og vises med tidsbegrensede lenker.
