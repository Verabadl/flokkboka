// Dyreslag i Flokkboka. Legg til en ny art ved å kopiere en blokk og tilpasse den.
// "ekstra"-feltene lagres i kolonnen dyr.ekstra (jsonb), så databasen trenger ingen endring.
window.ARTER = {
  sau: {
    navn: "Sau", ikon: "S", idLabel: "Øremerke-nr", idEksempel: "f.eks. NO 12345 0421",
    hunn: "Søye", hann: "Vær", ung: "Lam", morL: "Mor (søye)", farL: "Far (vær)",
    raser: ["Norsk kvit sau","Spælsau","Pelssau","Gammalnorsk spæl","Gammalnorsk sau","Rygja","Dala","Steigar","Texel","Kryssing"],
    statuser: ["Aktiv","Solgt","Slaktet","Død","Tapt på beite","Utmeldt"],
    ekstra: [
      { k: "fodselstype", l: "Fødselstype", opts: ["","Enkel","Tvilling","Trilling","Firling"] },
      { k: "fodselsvekt", l: "Fødselsvekt (kg)", type: "number" },
      { k: "bruk", l: "Bruk", opts: ["","Avl","Slakt","Påsett","Livdyr"] }
    ],
    hendelser: [
      { n: "Veiing", v: "Vekt (kg)" }, { n: "Lamming", v: "Antall lam" }, { n: "Vaksinering" }, { n: "Klipping", v: "Ull (kg)" },
      { n: "Behandling" }, { n: "Klauvskjæring" }, { n: "Beiteslipp" }, { n: "Sanking" }, { n: "Paring/bedekning" },
      { n: "Avlsvurdering", v: "Poeng" }, { n: "Flytting" }, { n: "Observasjon", obs: true }
    ]
  },
  hund: {
    navn: "Hund", ikon: "H", idLabel: "Reg.nr (NKK)", idEksempel: "f.eks. NO45678/22",
    hunn: "Tispe", hann: "Hannhund", ung: "Valp", morL: "Mor (tispe)", farL: "Far (hannhund)",
    raser: ["Border collie","Kelpie","Australian shepherd","Old english sheepdog","Norsk elghund grå","Norsk buhund","Labrador retriever","Blanding"],
    statuser: ["Aktiv","Solgt","Omplassert","Død","Utmeldt"],
    ekstra: [
      { k: "chip", l: "Chip-nr" }, { k: "kallenavn", l: "Kallenavn" },
      { k: "bruk", l: "Bruk", opts: ["","Gjeterhund","Familiehund","Jakt","Avl","Utstilling"] }
    ],
    hendelser: [
      { n: "Vaksine" }, { n: "Ormekur" }, { n: "Veterinær" }, { n: "Veiing", v: "Vekt (kg)" }, { n: "Trening" },
      { n: "Gjeterprøve", v: "Poeng" }, { n: "Utstilling", v: "Plassering" }, { n: "Parring" },
      { n: "Kull", v: "Antall valper" }, { n: "Observasjon", obs: true }
    ]
  }
};
