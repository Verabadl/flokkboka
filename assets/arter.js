// Dyreslag i Flokkboka. Legg til en ny art ved å kopiere en blokk og tilpasse den.
// "ekstra"-feltene lagres i kolonnen dyr.ekstra (jsonb), så databasen trenger ingen endring.
// hunnP/hannP/ungP er flertallsformer som brukes i tellere og rapporter.
// hannKastrert + kastrertFelt: kjønnsbetegnelse for kastrerte hanndyr (vallak, kastrat) styrt av et ja/nei-felt.
// Felt med type "date" vises som datovelger og tolkes som dato ved Excel-import.
// Raselistene er forslag i skjemaet; annen rase kan skrives inn fritt.
window.ARTER = {
  sau: {
    navn: "Sau", ikon: "S", idLabel: "Øremerke-nr", idEksempel: "f.eks. NO 12345 0421",
    hunn: "Søye", hann: "Vær", ung: "Lam", hunnP: "Søyer", hannP: "Værer", ungP: "Lam",
    morL: "Mor (søye)", farL: "Far (vær)",
    raser: [
      "Norsk kvit sau", "Spælsau", "Pelssau", "Gammalnorsk spælsau (villsau)", "Gammalnorsk sau",
      "Grå trøndersau", "Fuglestadbrogete", "Dala", "Rygja", "Steigar", "Sjeviot", "Texel",
      "Suffolk", "Oxford Down", "Shropshire", "Dorset", "Leicester", "Gotlandsau", "Kryssing"
    ],
    statuser: ["Aktiv", "Solgt", "Slaktet", "Død", "Tapt på beite", "Utmeldt"],
    ekstra: [
      { k: "fodselstype", l: "Fødselstype", opts: ["", "Enkel", "Tvilling", "Trilling", "Firling", "Femling"] },
      { k: "fodselsvekt", l: "Fødselsvekt (kg)", type: "number" },
      { k: "bruk", l: "Bruk", opts: ["", "Avl", "Slakt", "Påsett", "Livdyr"] }
    ],
    hendelser: [
      { n: "Veiing", v: "Vekt (kg)" }, { n: "Lamming", v: "Antall lam" }, { n: "Vaksinering" }, { n: "Ormebehandling" },
      { n: "Klipping", v: "Ull (kg)" }, { n: "Behandling" }, { n: "Klauvskjæring" }, { n: "Beiteslipp" }, { n: "Sanking" },
      { n: "Paring/bedekning" }, { n: "Avvenning" }, { n: "Avlsvurdering", v: "Poeng" }, { n: "Flytting" },
      { n: "Observasjon", obs: true }
    ]
  },
  geit: {
    navn: "Geit", ikon: "G", idLabel: "Øremerke-nr", idEksempel: "f.eks. NO 12345 0088",
    hunn: "Geit", hann: "Bukk", ung: "Kje", hunnP: "Geiter", hannP: "Bukker", ungP: "Kje",
    morL: "Mor (geit)", farL: "Far (bukk)",
    raser: [
      "Norsk melkegeit", "Kystgeit", "Boer", "Saanen", "Alpin", "Toggenburg", "Anglo-nubisk",
      "Dverggeit", "Angora", "Kashmir", "Kryssing"
    ],
    statuser: ["Aktiv", "Solgt", "Slaktet", "Død", "Tapt på beite", "Utmeldt"],
    ekstra: [
      { k: "fodselstype", l: "Fødselstype", opts: ["", "Enkel", "Tvilling", "Trilling", "Firling"] },
      { k: "fodselsvekt", l: "Fødselsvekt (kg)", type: "number" },
      { k: "horn", l: "Horn", opts: ["", "Kollet", "Hornet", "Avhornet"] },
      { k: "bruk", l: "Bruk", opts: ["", "Melk", "Kjøtt", "Fiber", "Avl", "Påsett", "Hobby"] }
    ],
    hendelser: [
      { n: "Veiing", v: "Vekt (kg)" }, { n: "Kjeing", v: "Antall kje" }, { n: "Melkekontroll", v: "Liter/dag" },
      { n: "Vaksinering" }, { n: "Ormebehandling" }, { n: "Avhorning" }, { n: "Klauvskjæring" }, { n: "Klipping", v: "Fiber (kg)" },
      { n: "Behandling" }, { n: "Paring/bedekning" }, { n: "Avvenning" }, { n: "Beiteslipp" }, { n: "Flytting" },
      { n: "Observasjon", obs: true }
    ]
  },
  storfe: {
    navn: "Storfe", ikon: "St", idLabel: "Individnr (øremerke)", idEksempel: "f.eks. NO 1234567 0123 4",
    hunn: "Ku", hann: "Okse", ung: "Kalv", hunnP: "Kyr/kviger", hannP: "Okser", ungP: "Kalver",
    hannKastrert: "Kastrat", kastrertFelt: "kastrert", morL: "Mor (ku)", farL: "Far (okse)",
    raser: [
      "NRF (Norsk rødt fe)", "STN (Sidet trønder- og nordlandsfe)", "Vestlandsk raudkolle", "Vestlandsk fjordfe",
      "Østlandsk raudkolle", "Telemarkfe", "Dølafe", "Hereford", "Aberdeen Angus", "Charolais", "Limousin",
      "Simmental", "Highland", "Tiroler grauvieh", "Blonde d'Aquitaine", "Dexter", "Holstein", "Jersey", "Kryssing"
    ],
    statuser: ["Aktiv", "Solgt", "Slaktet", "Død", "Nødslaktet", "Utmeldt"],
    ekstra: [
      { k: "bruk", l: "Bruk", opts: ["", "Melkeku", "Ammeku", "Kvige", "Avlsokse", "Slakt", "Påsett"] },
      { k: "kastrert", l: "Kastrert", opts: ["", "Nei", "Ja"] },
      { k: "fodselsforlop", l: "Fødselsforløp", opts: ["", "Lett", "Normal", "Tung", "Keisersnitt"] },
      { k: "fodselstype", l: "Fødselstype", opts: ["", "Enkel", "Tvilling", "Trilling"] },
      { k: "fodselsvekt", l: "Fødselsvekt (kg)", type: "number" },
      { k: "horn", l: "Horn", opts: ["", "Kollet", "Hornet", "Avhornet"] },
      { k: "laktasjon", l: "Laktasjonsnr", type: "number" },
      { k: "hdr_meldt", l: "Meldt til Husdyrregisteret", type: "date" }
    ],
    hendelser: [
      { n: "Kalving", v: "Antall kalver" }, { n: "Inseminering", v: "Okse/sæd" }, { n: "Naturlig bedekning", v: "Okse" },
      { n: "Drektighetsundersøkelse", v: "Resultat" }, { n: "Tørrlegging" }, { n: "Melkekontroll", v: "kg/dag" },
      { n: "Celletall", v: "1000 celler/ml" }, { n: "Veiing", v: "Vekt (kg)" }, { n: "Holdvurdering", v: "Poeng 1–5" },
      { n: "Medisinsk behandling", v: "Preparat/dose" }, { n: "Vaksinering" }, { n: "Ormebehandling" },
      { n: "Avhorning" }, { n: "Kastrering" }, { n: "Klauvskjæring" }, { n: "Avvenning" }, { n: "Beiteslipp" },
      { n: "Innsett" }, { n: "Flytting" }, { n: "Melding til Husdyrregisteret", v: "Meldingstype" },
      { n: "Slaktevurdering", v: "Klasse/fett" }, { n: "Observasjon", obs: true }
    ]
  },
  hund: {
    navn: "Hund", ikon: "Hu", idLabel: "Reg.nr (NKK)", idEksempel: "f.eks. NO45678/22",
    hunn: "Tispe", hann: "Hannhund", ung: "Valp", hunnP: "Tisper", hannP: "Hannhunder", ungP: "Valper",
    morL: "Mor (tispe)", farL: "Far (hannhund)",
    raser: [
      "Labrador retriever", "Golden retriever", "Border collie", "Australian shepherd", "Kelpie (australsk)",
      "Shetland sheepdog", "Collie (langhåret)", "Old english sheepdog", "Schäfer", "Norsk elghund grå",
      "Norsk elghund sort", "Norsk buhund", "Norsk lundehund", "Dunker", "Haldenstøver", "Hygenhund",
      "Engelsk setter", "Irsk setter", "Gordon setter", "Vorstehhund, strihåret", "Vorstehhund, korthåret",
      "Engelsk springer spaniel", "Cocker spaniel", "Nova scotia duck tolling retriever", "Flat coated retriever",
      "Fransk bulldog", "Dvergschnauzer", "Chihuahua", "Cavalier king charles spaniel", "Bichon frisé",
      "Pomeranian", "Jack russell terrier", "Dachshund", "Beagle", "Puddel", "Whippet", "Berner sennenhund",
      "Rottweiler", "Siberian husky", "Alaskan malamute", "Samojed", "Finsk lapphund", "Islandsk fårehund",
      "Blanding"
    ],
    statuser: ["Aktiv", "Solgt", "Omplassert", "Død", "Utmeldt"],
    ekstra: [
      { k: "chip", l: "Chip-nr" }, { k: "kallenavn", l: "Kallenavn" },
      { k: "bruk", l: "Bruk", opts: ["", "Gjeterhund", "Familiehund", "Jakt", "Avl", "Utstilling", "Tjenestehund"] }
    ],
    hendelser: [
      { n: "Vaksine" }, { n: "Ormekur" }, { n: "Veterinær" }, { n: "Veiing", v: "Vekt (kg)" }, { n: "Trening" },
      { n: "Gjeterprøve", v: "Poeng" }, { n: "Jaktprøve", v: "Premie" }, { n: "Utstilling", v: "Plassering" },
      { n: "Parring" }, { n: "Kull", v: "Antall valper" }, { n: "HD/AD-røntgen", v: "Resultat" }, { n: "Observasjon", obs: true }
    ]
  },
  hest: {
    navn: "Hest", ikon: "He", idLabel: "UELN / reg.nr", idEksempel: "f.eks. 578001020212345",
    hunn: "Hoppe", hann: "Hingst", ung: "Føll", hunnP: "Hopper", hannP: "Hingster/vallaker", ungP: "Føll",
    hannKastrert: "Vallak", kastrertFelt: "vallak", morL: "Mor (hoppe)", farL: "Far (hingst)",
    raser: [
      "Fjordhest", "Dølahest", "Nordlandshest/lyngshest", "Kaldblodstraver", "Varmblodstraver",
      "Varmblods ridehest", "Hannoveraner", "Holsteiner", "Oldenburger", "Trakehner", "KWPN",
      "Svensk varmblod", "Dansk varmblod", "Engelsk fullblod", "Araber", "Islandshest", "Shetlandsponni",
      "Welsh ponni/cob", "New Forest ponni", "Connemara ponni", "Gotlandsruss", "Haflinger",
      "Irish cob (tinker)", "Frieser", "Quarter horse", "Appaloosa", "Paint horse", "Lusitano",
      "PRE (andalusier)", "Kryssing"
    ],
    statuser: ["Aktiv", "Solgt", "Utleid/fôrvert", "Død", "Avlivet", "Utmeldt"],
    ekstra: [
      { k: "vallak", l: "Kastrert (vallak)", opts: ["", "Nei", "Ja"] },
      { k: "chip", l: "Chip-nr" }, { k: "kallenavn", l: "Kallenavn" },
      { k: "mankehoyde", l: "Mankehøyde (cm)", type: "number" },
      { k: "bruk", l: "Bruk", opts: ["", "Ridning", "Kjøring", "Trav", "Avl", "Fritid", "Skogsarbeid"] }
    ],
    hendelser: [
      { n: "Hovslager", v: "Skodd/rasket" }, { n: "Tannbehandling" }, { n: "Vaksinering" }, { n: "Ormekur" },
      { n: "Veterinær" }, { n: "Veiing", v: "Vekt (kg)" }, { n: "Trening" }, { n: "Konkurranse", v: "Plassering" },
      { n: "Kåring/bedømmelse", v: "Premie" }, { n: "Bedekning" }, { n: "Følling", v: "Antall føll" },
      { n: "Flytting" }, { n: "Observasjon", obs: true }
    ]
  }
};
