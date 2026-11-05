/* Flokkboka – web-app mot Supabase.
   Avhenger av: supabase-js (global "supabase"), jsPDF (global "jspdf"), SheetJS (global "XLSX"), config.js og arter.js. */
(() => {
"use strict";
const ARTER = window.ARTER;
const CFG = window.FLOKKBOKA_CONFIG || {};
const BUCKET = "dyrebilder";
const BASE_URL = location.origin + location.pathname;
const LKEY = "flokkboka-visning";

/* ---------- Tilstand ---------- */
const FILTER0 = { q: "", art: "alle", kjonn: "alle", status: "Aktiv", arkiv: "alle", rase: "alle", aar: "alle", sort: "id" };
const S = {
  sb: null, session: null, me: null,
  dyr: [], hend: [], profiler: {}, delinger: [], bilder: {}, bildeData: {}, lastet: 0, laster: false,
  view: "arkiv", sel: null, edit: null, hf: null, bekreft: null,
  f: { ...FILTER0 },
  opt: { bildeRapport: true, bildeRelasjon: true },
  rap: { id: "", type: "individ", art: "sau", arkiv: "alle", fra: new Date().getFullYear() + "-01-01", til: "" },
  fo: null, imp: null,
  auth: { mode: "inn", err: "", msg: "" }
};
try { const v = JSON.parse(localStorage.getItem(LKEY) || "null"); if (v) { Object.assign(S.f, v.f || {}, { q: "" }); Object.assign(S.opt, v.opt || {}); } } catch (e) {}
function husk() { try { localStorage.setItem(LKEY, JSON.stringify({ f: S.f, opt: S.opt })); } catch (e) {} }

/* ---------- Små hjelpere ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtD = d => d ? new Date(String(d).slice(0, 10) + "T12:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" }) : "–";
const byId = id => S.dyr.find(d => d.id === id);
const A_ = d => ARTER[d && d.art] || ARTER.sau;
const ex = (d, k) => (d && d.ekstra && d.ekstra[k]) || "";
const normId = s => String(s ?? "").toUpperCase().replace(/\s+/g, "");
const norm = s => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
function alder(f, ved) {
  if (!f) return "–";
  const a = new Date(f), n = ved ? new Date(ved) : new Date();
  let m = (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth();
  if (n.getDate() < a.getDate()) m--;
  if (m < 0) return "–";
  const y = Math.floor(m / 12);
  return y ? `${y} år${m % 12 ? " " + (m % 12) + " mnd" : ""}` : `${m} mnd`;
}
const erUng = d => d.fodt && new Date(d.fodt).getFullYear() === new Date().getFullYear();
const erAktiv = d => (d.status || "Aktiv") === "Aktiv";
function kjL(d) {
  if (!d) return "";
  const A = A_(d);
  if (d.kjonn === "hann" && A.hannKastrert && ex(d, "vallak") === "Ja") return A.hannKastrert;
  return A[d.kjonn === "hann" ? "hann" : "hunn"];
}
const label = d => d ? (d.navn || d.idnr || "Uten navn") : "";
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3600); }
const feil = e => (e && (e.message || e.error_description)) || String(e);
function vent(knapp, på) { if (knapp) knapp.disabled = på; }

/* ---------- Tilgang i klienten (databasen håndhever det samme) ---------- */
const erAdmin = () => S.me && S.me.rolle === "admin";
function tilgang(eier) {
  if (!S.me) return null;
  if (eier === S.me.id) return "eier";
  if (erAdmin()) return "admin";
  const d = S.delinger.find(x => x.eier_id === eier && x.mottaker_id === S.me.id);
  return d ? d.tilgang : null;
}
const kanSkrive = eier => ["eier", "admin", "skriv"].includes(tilgang(eier));
const kanSlette = eier => ["eier", "admin"].includes(tilgang(eier));
function skrivbareArkiv() {
  if (erAdmin()) return [S.me.id, ...Object.values(S.profiler).filter(p => p.aktiv && p.id !== S.me.id).map(p => p.id)];
  return [S.me.id, ...S.delinger.filter(x => x.mottaker_id === S.me.id && x.tilgang === "skriv").map(x => x.eier_id)];
}
function lesbareArkiv() {
  const ider = new Set([S.me.id, ...S.dyr.map(d => d.eier_id)]);
  S.delinger.filter(x => x.mottaker_id === S.me.id).forEach(x => ider.add(x.eier_id));
  return [...ider];
}
const pNavn = id => { const p = S.profiler[id]; return p ? (p.navn || p.epost) : "Ukjent bruker"; };
const arkivNavn = id => id === (S.me && S.me.id) ? "Mitt arkiv" : pNavn(id);

/* ---------- Oppstart ---------- */
function oppsettMangler() {
  return !CFG.supabaseUrl || !CFG.supabaseAnonKey || /DITT-PROSJEKT|DIN-ANON/.test(CFG.supabaseUrl + CFG.supabaseAnonKey);
}
async function init() {
  if (oppsettMangler() || !window.supabase) { renderOppsett(); return; }
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  S.sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") { S.session = session; S.auth = { mode: "nyttpassord", err: "", msg: "" }; renderAuth(); return; }
    if (ev === "SIGNED_OUT") { Object.assign(S, { session: null, me: null, dyr: [], hend: [], profiler: {}, delinger: [], bilder: {}, bildeData: {}, view: "arkiv", sel: null, fo: null, imp: null }); renderAuth(); return; }
    if (ev === "SIGNED_IN" && session && (!S.session || S.session.user.id !== session.user.id) && S.auth.mode !== "nyttpassord") { S.session = session; startApp(); }
  });
  const { data } = await S.sb.auth.getSession();
  S.session = data.session;
  if (S.session && S.auth.mode !== "nyttpassord") startApp(); else if (!S.session) renderAuth();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.me && Date.now() - S.lastet > 60000) lastData(); });
}
async function startApp() {
  $("#app").innerHTML = `<div class="empty">Henter profil …</div>`;
  const { data, error } = await S.sb.from("profiles").select("*").eq("id", S.session.user.id).maybeSingle();
  if (error || !data) { visMelding("Fant ingen profil for kontoen", "Kjør supabase/schema.sql på nytt, eller kontakt administrator. " + (error ? feil(error) : "")); return; }
  if (!data.aktiv) { visMelding("Kontoen er deaktivert", "En administrator har stengt tilgangen din. Ta kontakt med administrator for å få den åpnet igjen."); return; }
  S.me = data;
  if (S.f.arkiv !== "alle" && S.f.arkiv !== S.me.id) S.f.arkiv = "alle";
  await lastData();
}
async function hentAlle(tabell) {
  let ut = [], fra = 0;
  for (;;) {
    const { data, error } = await S.sb.from(tabell).select("*").order("opprettet").range(fra, fra + 999);
    if (error) throw error;
    ut = ut.concat(data);
    if (data.length < 1000) break;
    fra += 1000;
  }
  return ut;
}
async function lastData() {
  if (S.laster) return;
  S.laster = true;
  try {
    const [dyr, hend, delinger, prof] = await Promise.all([hentAlle("dyr"), hentAlle("hendelser"), hentAlle("delinger"), hentAlle("profiles")]);
    S.dyr = dyr; S.hend = hend; S.delinger = delinger;
    S.profiler = Object.fromEntries(prof.map(p => [p.id, p]));
    if (S.profiler[S.me.id]) S.me = S.profiler[S.me.id];
    S.lastet = Date.now();
    await lastBilder();
  } catch (e) { toast("Kunne ikke hente data: " + feil(e)); }
  S.laster = false;
  render();
}
async function lastBilder() {
  const mangler = [...new Set(S.dyr.map(d => d.bilde_path).filter(p => p && !S.bilder[p]))];
  for (let i = 0; i < mangler.length; i += 100) {
    const { data } = await S.sb.storage.from(BUCKET).createSignedUrls(mangler.slice(i, i + 100), 60 * 60 * 12);
    (data || []).forEach(x => { if (x.signedUrl) S.bilder[x.path] = x.signedUrl; });
  }
}
const bildeUrl = d => d && d.bilde_path ? S.bilder[d.bilde_path] || "" : "";

/* Bilde som JPEG-data for PDF (nedskalert). Returnerer null om bildet ikke kan leses. */
async function bildeData(d, maxPx = 600) {
  const url = bildeUrl(d);
  if (!url) return null;
  if (S.bildeData[d.bilde_path] !== undefined) return S.bildeData[d.bilde_path];
  let res = null;
  try {
    const blob = await (await fetch(url)).blob();
    const ou = URL.createObjectURL(blob);
    const img = await new Promise((ok, nei) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nei; i.src = ou; });
    const s = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    res = { data: c.toDataURL("image/jpeg", 0.82), w: c.width, h: c.height };
    URL.revokeObjectURL(ou);
  } catch (e) { res = null; }
  S.bildeData[d.bilde_path] = res;
  return res;
}
async function forhånd(dyrListe, maxPx) { await Promise.all([...new Set(dyrListe.filter(Boolean))].map(d => bildeData(d, maxPx))); }

/* ---------- Oppsett / melding / innlogging ---------- */
function renderOppsett() {
  $("#top").hidden = true;
  $("#app").innerHTML = `<div class="auth"><div class="brandbig"><img src="assets/ikon.svg" width="46" height="46" alt=""><h1>Flokkboka</h1></div>
  <div class="card"><h2>Koble til Supabase</h2>
  <p style="margin:0">Appen mangler tilkobling til databasen. Åpne <span class="mono">config.js</span> og fyll inn prosjektets URL og <i>anon public</i>-nøkkel fra Supabase (Project Settings → API). Se README.md for hele oppsettet.</p></div></div>`;
}
function visMelding(tittel, tekst) {
  $("#top").hidden = true;
  $("#app").innerHTML = `<div class="auth"><div class="card"><h2>${esc(tittel)}</h2><p style="margin:0">${esc(tekst)}</p><div><button class="btn" data-act="loggut">Logg ut</button></div></div></div>`;
}
function renderAuth() {
  $("#top").hidden = true;
  const m = S.auth.mode, msg = S.auth.msg ? `<p class="ok" style="margin:0">${esc(S.auth.msg)}</p>` : "", err = S.auth.err ? `<p class="err" style="margin:0">${esc(S.auth.err)}</p>` : "";
  let body;
  if (m === "registrer") body = `<h2>Opprett konto</h2>
    <label class="f">Navn<input id="a-navn" type="text" autocomplete="name" required></label>
    <label class="f">E-post<input id="a-epost" type="email" autocomplete="email" required></label>
    <label class="f">Passord (minst 8 tegn)<input id="a-pass" type="password" autocomplete="new-password" minlength="8" required></label>
    ${err}${msg}<button class="btn pri" type="submit">Opprett konto</button>
    <p class="muted" style="margin:0;font-size:.9rem">Har du konto? <button type="button" class="linkbtn" data-act="authmode" data-v="inn">Logg inn</button></p>`;
  else if (m === "glemt") body = `<h2>Glemt passord</h2>
    <label class="f">E-post<input id="a-epost" type="email" autocomplete="email" required></label>
    ${err}${msg}<button class="btn pri" type="submit">Send lenke for nytt passord</button>
    <p style="margin:0"><button type="button" class="linkbtn" data-act="authmode" data-v="inn">Tilbake til innlogging</button></p>`;
  else if (m === "nyttpassord") body = `<h2>Velg nytt passord</h2>
    <label class="f">Nytt passord (minst 8 tegn)<input id="a-pass" type="password" autocomplete="new-password" minlength="8" required></label>
    ${err}${msg}<button class="btn pri" type="submit">Lagre passord</button>`;
  else body = `<h2>Logg inn</h2>
    <label class="f">E-post<input id="a-epost" type="email" autocomplete="email" required></label>
    <label class="f">Passord<input id="a-pass" type="password" autocomplete="current-password" required></label>
    ${err}${msg}<button class="btn pri" type="submit">Logg inn</button>
    <p class="muted" style="margin:0;font-size:.9rem"><button type="button" class="linkbtn" data-act="authmode" data-v="glemt">Glemt passord?</button> · Ny bruker? <button type="button" class="linkbtn" data-act="authmode" data-v="registrer">Opprett konto</button></p>`;
  $("#app").innerHTML = `<div class="auth"><div class="brandbig"><img src="assets/ikon.svg" width="46" height="46" alt=""><div><h1>Flokkboka</h1><span class="muted">Digitalt arkiv for sau, geit, hund og hest</span></div></div>
    <form class="card" id="authform">${body}</form></div>`;
}
async function authSubmit(btn) {
  const v = id => ($("#" + id) || {}).value || "", m = S.auth.mode;
  S.auth.err = ""; S.auth.msg = ""; vent(btn, true);
  try {
    if (m === "inn") {
      const { error } = await S.sb.auth.signInWithPassword({ email: v("a-epost").trim(), password: v("a-pass") });
      if (error) throw error;
      return;
    }
    if (m === "registrer") {
      const { data, error } = await S.sb.auth.signUp({ email: v("a-epost").trim(), password: v("a-pass"), options: { data: { navn: v("a-navn").trim() }, emailRedirectTo: BASE_URL } });
      if (error) throw error;
      if (!data.session) S.auth = { mode: "inn", err: "", msg: "Konto opprettet. Bekreft e-postadressen via lenken vi sendte, og logg deretter inn." };
    }
    if (m === "glemt") {
      const { error } = await S.sb.auth.resetPasswordForEmail(v("a-epost").trim(), { redirectTo: BASE_URL });
      if (error) throw error;
      S.auth.msg = "Hvis e-posten finnes, har vi sendt en lenke for å velge nytt passord.";
    }
    if (m === "nyttpassord") {
      const { error } = await S.sb.auth.updateUser({ password: v("a-pass") });
      if (error) throw error;
      S.auth = { mode: "inn", err: "", msg: "" }; toast("Passordet er endret"); history.replaceState(null, "", BASE_URL); startApp(); return;
    }
  } catch (e) { S.auth.err = oversettAuth(feil(e)); }
  renderAuth();
}
function oversettAuth(t) {
  if (/Invalid login credentials/i.test(t)) return "Feil e-post eller passord.";
  if (/Email not confirmed/i.test(t)) return "E-postadressen er ikke bekreftet ennå. Sjekk innboksen din.";
  if (/already registered/i.test(t)) return "Det finnes allerede en konto med denne e-posten.";
  if (/at least/i.test(t)) return "Passordet er for kort.";
  return t;
}

/* ---------- Relasjoner ---------- */
const avkom = id => S.dyr.filter(d => d.mor_id === id || d.far_id === id).sort((a, b) => (a.fodt || "").localeCompare(b.fodt || ""));
function sosken(d) {
  return S.dyr.filter(x => x.id !== d.id && ((d.mor_id && x.mor_id === d.mor_id) || (d.far_id && x.far_id === d.far_id)))
    .map(x => ({ d: x, hel: d.mor_id && d.far_id && x.mor_id === d.mor_id && x.far_id === d.far_id }));
}
function erEtterkommer(kand, av, seen = new Set()) {
  const k = byId(kand); if (!k || seen.has(kand)) return false; seen.add(kand);
  if (k.mor_id === av || k.far_id === av) return true;
  return (k.mor_id && erEtterkommer(k.mor_id, av, seen)) || (k.far_id && erEtterkommer(k.far_id, av, seen));
}
function stamtre(id) { const a = Array(16).fill(null); a[1] = id; for (let i = 1; i < 8; i++) { const d = a[i] && byId(a[i]); if (d) { a[2 * i] = d.far_id || null; a[2 * i + 1] = d.mor_id || null; } } return a; }
function aner(id, maxGen = 4) { const m = new Map(); (function go(x, g) { if (!x || g > maxGen) return; const d = byId(x); if (!d) return; m.set(x, Math.min(m.get(x) ?? 99, g)); go(d.far_id, g + 1); go(d.mor_id, g + 1); })(id, 0); return m; }
function felles(d) { if (!d.mor_id || !d.far_id) return []; const a = aner(d.far_id), b = aner(d.mor_id); return [...a.keys()].filter(k => b.has(k)).map(k => ({ id: k, gf: a.get(k) + 1, gm: b.get(k) + 1 })); }
const hendFor = id => S.hend.filter(h => h.dyr_id === id).sort((a, b) => (b.dato || "").localeCompare(a.dato || ""));
function sisteVekt(id, til) { const h = hendFor(id).find(h => h.type === "Veiing" && h.verdi && (!til || h.dato <= til)); return h ? h.verdi + " kg (" + fmtD(h.dato) + ")" : "–"; }
const ROLLER = ["", "Individ", "Far", "Mor", "Farfar", "Farmor", "Morfar", "Mormor", "Farfars far", "Farfars mor", "Farmors far", "Farmors mor", "Morfars far", "Morfars mor", "Mormors far", "Mormors mor"];

/* ---------- Byggeklosser ---------- */
function thumb(d, visBilde = true, cls = "thumb") { const u = visBilde && bildeUrl(d); return u ? `<img class="${cls}" src="${esc(u)}" alt="">` : `<div class="${cls}">${esc(A_(d).ikon)}</div>`; }
function badges(d) {
  return `${d.idnr ? `<span class="ear">${esc(d.idnr)}</span>` : ""}<span class="sex ${d.kjonn === "hann" ? "hann" : "hunn"}">${esc(kjL(d))}</span>` +
    (erUng(d) ? `<span class="pill lam">${esc(A_(d).ung)}</span>` : "") +
    `<span class="pill ${erAktiv(d) ? "aktiv" : ""}">${esc(d.status || "Aktiv")}</span>`;
}
const chip = (act, key, v, l, on, extra = "") => `<button class="chip" data-act="${act}" data-k="${key}" data-v="${esc(v)}" aria-pressed="${on}" ${extra}>${esc(l)}</button>`;
const slettKnapp = (nøkkel, tekst, bekreftTekst, attrs) => `<button class="btn sm danger ${S.bekreft === nøkkel ? "on" : ""}" ${attrs}>${S.bekreft === nøkkel ? esc(bekreftTekst) : esc(tekst)}</button>`;
const sjekk = (id, on, tekst) => `<label class="check"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span>${esc(tekst)}</span></label>`;
const velg = (id, opts, val, aria, cls = "") => `<select id="${id}" aria-label="${esc(aria)}" ${cls ? `class="${cls}"` : ""}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

/* ---------- Filter (arkivliste) ---------- */
function arkivValg() {
  const ider = lesbareArkiv().filter(id => id !== S.me.id);
  return [["alle", "Alle arkiv jeg har tilgang til"], [S.me.id, "Mitt arkiv"], ...ider.map(id => [id, pNavn(id) + (tilgang(id) === "les" ? " (lesetilgang)" : "")])];
}
function filterGrunnlag(utenom) {
  const f = S.f, q = f.q.trim().toLowerCase();
  return S.dyr.filter(d =>
    (utenom === "arkiv" || f.arkiv === "alle" || d.eier_id === f.arkiv) &&
    (utenom === "art" || f.art === "alle" || d.art === f.art) &&
    (utenom === "kjonn" || f.kjonn === "alle" || d.kjonn === f.kjonn) &&
    (utenom === "status" || f.status === "alle" || (d.status || "Aktiv") === f.status) &&
    (utenom === "rase" || f.rase === "alle" || (d.rase || "") === f.rase) &&
    (utenom === "aar" || f.aar === "alle" || (d.fodt || "").slice(0, 4) === f.aar) &&
    (!q || [d.navn, d.idnr, d.rase, d.farge, d.merknad, ...Object.values(d.ekstra || {})].join(" ").toLowerCase().includes(q)));
}
const SORT = {
  id: (a, b) => (a.art || "").localeCompare(b.art || "") || String(a.idnr || a.navn || "").localeCompare(String(b.idnr || b.navn || ""), "nb", { numeric: true }),
  navn: (a, b) => label(a).localeCompare(label(b), "nb", { numeric: true }),
  nyest: (a, b) => (b.fodt || "").localeCompare(a.fodt || ""),
  eldst: (a, b) => (a.fodt || "9999").localeCompare(b.fodt || "9999")
};
const filtrert = () => filterGrunnlag().sort(SORT[S.f.sort] || SORT.id);
const filterAktivt = () => Object.keys(FILTER0).some(k => k !== "sort" && S.f[k] !== FILTER0[k]);
const teller = (liste, key, v) => liste.filter(d => key === "art" ? d.art === v : d.kjonn === v).length;

function statTiles(liste) {
  if (S.f.art === "alle") {
    const arter = Object.entries(ARTER).filter(([k]) => liste.some(d => d.art === k));
    const tiles = [...arter.map(([k, a]) => [liste.filter(d => d.art === k).length, a.navn]), [liste.length, "I alt"]];
    return tiles.slice(-4);
  }
  const A = ARTER[S.f.art] || ARTER.sau;
  return [[liste.filter(d => d.kjonn === "hunn" && !erUng(d)).length, A.hunnP], [liste.filter(d => d.kjonn === "hann" && !erUng(d)).length, A.hannP],
    [liste.filter(erUng).length, A.ungP + " i år"], [liste.length, "I alt"]];
}
function listPane() {
  const rows = filtrert();
  const st = `<div class="stats">${statTiles(rows).map(([n, l]) => `<div class="stat"><b>${n}</b><span>${esc(l)}</span></div>`).join("")}</div>`;
  const statuser = [...new Set(Object.values(ARTER).flatMap(a => a.statuser))];
  const valg = arkivValg();
  const forArt = filterGrunnlag("art"), forKj = filterGrunnlag("kjonn");
  const raser = [...new Set(filterGrunnlag("rase").map(d => d.rase).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb"));
  if (S.f.rase !== "alle" && !raser.includes(S.f.rase)) raser.unshift(S.f.rase);
  const år = [...new Set(filterGrunnlag("aar").map(d => (d.fodt || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  if (S.f.aar !== "alle" && !år.includes(S.f.aar)) år.unshift(S.f.aar);
  const arterMedData = Object.entries(ARTER);
  const fl = `<div class="filters">
    ${valg.length > 2 || erAdmin() ? velg("farkiv", valg, S.f.arkiv, "Arkiv") : ""}
    <input type="search" id="q" placeholder="Søk navn, øremerke, reg.nr, rase …" value="${esc(S.f.q)}" aria-label="Søk i arkivet" autocomplete="off">
    <div class="row">${chip("filt", "art", "alle", "Alle " + forArt.length, S.f.art === "alle")}${arterMedData.map(([k, a]) => chip("filt", "art", k, `${a.navn} ${teller(forArt, "art", k)}`, S.f.art === k)).join("")}</div>
    <div class="row">${chip("filt", "kjonn", "alle", "Begge", S.f.kjonn === "alle")}${chip("filt", "kjonn", "hunn", `${S.f.art !== "alle" ? ARTER[S.f.art].hunn : "Hunn"} ${teller(forKj, "kjonn", "hunn")}`, S.f.kjonn === "hunn")}${chip("filt", "kjonn", "hann", `${S.f.art !== "alle" ? ARTER[S.f.art].hann : "Hann"} ${teller(forKj, "kjonn", "hann")}`, S.f.kjonn === "hann")}</div>
    <div class="row2">
      ${velg("fstatus", [["alle", "Alle statuser"], ...statuser.map(s => [s, s])], S.f.status, "Status")}
      ${velg("frase", [["alle", "Alle raser"], ...raser.map(r => [r, r])], S.f.rase, "Rase")}
      ${velg("faar", [["alle", "Alle fødselsår"], ...år.map(a => [a, "Født " + a])], S.f.aar, "Fødselsår")}
      ${velg("fsort", [["id", "Sorter: ID-nr"], ["navn", "Sorter: navn"], ["nyest", "Sorter: yngst først"], ["eldst", "Sorter: eldst først"]], S.f.sort, "Sortering")}
    </div>
    <div class="row toolbar">
      <button class="btn sm" data-act="nav" data-v="felles">Felles observasjon</button>
      <button class="btn sm" data-act="nav" data-v="import">Importer fra Excel</button>
      ${filterAktivt() ? `<button class="btn sm ghost" data-act="nullstill">Nullstill filter</button>` : ""}
    </div></div>`;
  let body;
  if (!S.lastet) body = `<div class="empty">Henter arkivet …</div>`;
  else if (!S.dyr.length) body = `<div class="empty"><h3>Arkivet er tomt</h3>Registrer første dyr med <b>+ Nytt individ</b>, eller importer en hel besetning fra Excel.</div>`;
  else if (!rows.length) body = `<div class="empty">Ingen individer passer filteret.<br><button class="btn sm" data-act="nullstill" style="margin-top:10px">Nullstill filter</button></div>`;
  else body = `<div class="list">${rows.map(d => `<button class="item" data-act="vis" data-id="${d.id}" aria-current="${S.sel === d.id}">
      ${thumb(d)}<div style="min-width:0"><div class="nm">${esc(label(d))}</div><div class="sub">${esc([d.idnr && d.navn ? d.idnr : "", d.rase, alder(d.fodt), erAktiv(d) ? "" : d.status, d.eier_id !== S.me.id ? arkivNavn(d.eier_id) : ""].filter(Boolean).join(" · "))}</div></div>
      <span class="sex ${d.kjonn === "hann" ? "hann" : "hunn"}">${esc(kjL(d))}</span></button>`).join("")}</div>`;
  return st + fl + `<p class="muted count" aria-live="polite">${rows.length} av ${S.dyr.length} individer</p>` + body;
}

/* ---------- Individkort ---------- */
function relCard(l, d, vis = S.opt.bildeRelasjon) {
  if (!d) return `<div class="relcard"><div><div class="l">${esc(l)}</div><div class="n muted">Ikke registrert</div></div></div>`;
  return `<button class="relcard has" data-act="vis" data-id="${d.id}">${thumb(d, vis)}<div><div class="l">${esc(l)}</div><div class="n">${esc(label(d))}</div><div class="muted" style="font-size:.78rem">${esc([d.idnr, d.fodt ? d.fodt.slice(0, 4) : ""].filter(Boolean).join(" · "))}</div></div></button>`;
}
const bildeBryter = () => `<button class="chip sm" data-act="togglerelbilde" aria-pressed="${S.opt.bildeRelasjon}">${S.opt.bildeRelasjon ? "Bilder vises" : "Bilder skjult"}</button>`;
function detalj() {
  const d = byId(S.sel);
  if (!d) return `<div class="card empty"><h3>Velg et individ</h3>Trykk på et dyr i arkivet for å se individdata, slektskap og hendelser.</div>`;
  const A = A_(d), ed = kanSkrive(d.eier_id), sl = kanSlette(d.eier_id), t = tilgang(d.eier_id);
  const kv = [["Art", A.navn], [A.idLabel, d.idnr], ["Født", fmtD(d.fodt)], ["Alder", alder(d.fodt)], ["Rase", d.rase], ["Farge/tegning", d.farge],
    ...A.ekstra.map(e => [e.l, ex(d, e.k)]), ["Siste vekt", sisteVekt(d.id)], ["Status", d.status || "Aktiv"], d.status_dato ? ["Statusdato", fmtD(d.status_dato)] : null,
    ["Arkiv", arkivNavn(d.eier_id)]].filter(Boolean);
  const mor = byId(d.mor_id), far = byId(d.far_id), av = avkom(d.id), so = sosken(d), hs = hendFor(d.id), ff = felles(d);
  const hendForm = S.hf && S.hf.dyr_id === d.id ? hendelseSkjema(d) : "";
  const u = bildeUrl(d);
  const harRelBilder = [mor, far, ...av, ...so.map(x => x.d)].some(x => x && x.bilde_path);
  return `<button class="btn sm back" data-act="nav" data-v="arkiv">← Arkiv</button>
  <div class="card" style="margin-top:8px">
    <div class="hero">${u ? `<img src="${esc(u)}" alt="Bilde av ${esc(label(d))}">` : `<div class="ph">${esc(A.ikon)}</div>`}
      <div style="min-width:0"><div class="eyebrow">${esc(A.navn)} · ${esc(kjL(d))}${t === "les" ? " · Lesetilgang" : ""}</div><h2>${esc(label(d))}</h2><div class="meta">${badges(d)}</div>
      <div class="actions noprint">
        ${ed ? `<button class="btn sm" data-act="rediger" data-id="${d.id}">Rediger</button>
        <button class="btn sm pri" data-act="nyhend" data-id="${d.id}">+ Hendelse</button>
        <button class="btn sm" data-act="nyavkom" data-id="${d.id}">+ Registrer avkom</button>` : ""}
        <button class="btn sm" data-act="rapport" data-id="${d.id}" data-t="individ">Individrapport</button>
        <button class="btn sm" data-act="rapport" data-id="${d.id}" data-t="relasjon">Relasjonsrapport</button>
      </div></div></div>
    <div class="sec"><dl class="kv">${kv.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || "–")}</dd></div>`).join("")}</dl>
      ${d.merknad ? `<p style="margin:0;white-space:pre-wrap">${esc(d.merknad)}</p>` : ""}</div>
    <div class="sec"><h3><span>Foreldre</span>${harRelBilder ? bildeBryter() : ""}</h3><div class="rel">${relCard(A.morL, mor)}${relCard(A.farL, far)}</div>
      ${ff.length ? `<div class="warn">Innavlsvarsel: mor og far har ${ff.length} felles ane${ff.length > 1 ? "r" : ""} (${ff.map(x => esc(label(byId(x.id)))).join(", ")}). Se relasjonsrapporten.</div>` : ""}</div>
    <div class="sec"><h3><span>Avkom <span class="muted" style="font-size:.85rem;font-weight:400">${av.length}</span></span></h3>
      ${av.length ? `<div class="rel">${av.map(x => relCard(`${kjL(x)} · ${x.fodt ? x.fodt.slice(0, 4) : "?"}`, x)).join("")}</div>` : `<p class="muted" style="margin:0">Ingen avkom registrert.</p>`}</div>
    ${so.length ? `<div class="sec"><h3><span>Søsken <span class="muted" style="font-size:.85rem;font-weight:400">${so.length}</span></span></h3><div class="rel">${so.map(x => relCard(x.hel ? "Helsøsken" : "Halvsøsken", x.d)).join("")}</div></div>` : ""}
    <div class="sec"><h3><span>Hendelser og observasjoner <span class="muted" style="font-size:.85rem;font-weight:400">${hs.length}</span></span></h3>
      ${hendForm}
      ${hs.length ? `<div class="timeline">${hs.map(h => { const def = A.hendelser.find(x => x.n === h.type) || {}; const fn = h.felles_id ? S.hend.filter(x => x.felles_id === h.felles_id).length : 0; return `<div class="ev ${def.obs ? "obs" : ""}"><div class="h"><span class="d">${esc(h.dato || "")}</span><span class="t">${esc(h.type)}</span>${h.verdi ? `<span class="pill">${esc(def.v || "Verdi")}: ${esc(h.verdi)}</span>` : ""}
        ${fn > 1 ? `<span class="pill felles" title="Registrert samtidig på ${fn} individer">Felles · ${fn} dyr</span>` : ""}
        ${h.registrert_av && h.registrert_av !== S.me.id ? `<span class="owner">av ${esc(pNavn(h.registrert_av))}</span>` : ""}
        ${ed ? `<span class="x">${slettKnapp("h:" + h.id, "Slett", "Bekreft slett", `data-act="delhend" data-id="${h.id}"`)}</span>` : ""}</div>${h.tekst ? `<p>${esc(h.tekst)}</p>` : ""}</div>`; }).join("")}</div>`
        : (hendForm ? "" : `<p class="muted" style="margin:0">Ingen hendelser ennå.${ed ? " Registrer veiing, vaksinering, fødsel eller en observasjon." : ""}</p>`)}</div>
    ${sl ? `<div class="sec noprint" style="border-top:1px solid var(--line);padding-top:14px"><div>${slettKnapp("d:" + d.id, "Slett individ", "Bekreft: slett individ og hendelser", `data-act="slett" data-id="${d.id}"`)}</div></div>` : ""}
  </div>`;
}
function hendelseSkjema(d) {
  const A = A_(d), h = S.hf, def = A.hendelser.find(x => x.n === h.type) || {};
  return `<form class="card grid" id="hform" style="background:var(--bg)">
    <label class="f">Type<select id="h-type">${A.hendelser.map(x => `<option ${x.n === h.type ? "selected" : ""}>${esc(x.n)}</option>`).join("")}</select></label>
    <label class="f">Dato<input type="date" id="h-dato" value="${esc(h.dato)}" required></label>
    ${def.v ? `<label class="f">${esc(def.v)}<input type="text" inputmode="decimal" id="h-verdi" value="${esc(h.verdi || "")}"></label>` : ""}
    <label class="f full">Beskrivelse / observasjon<textarea id="h-tekst" placeholder="Hva skjedde, hva ble observert, preparat, dose …">${esc(h.tekst || "")}</textarea></label>
    <div class="full actions" style="margin:0"><button class="btn pri" type="submit">Lagre hendelse</button><button class="btn" type="button" data-act="avbrythend">Avbryt</button></div></form>`;
}

/* ---------- Skjema for individ ---------- */
function skjema() {
  const e = S.edit, A = A_(e);
  const kand = k => S.dyr.filter(x => x.art === e.art && x.kjonn === k && x.id !== e.id && !(e.id && erEtterkommer(x.id, e.id)))
    .sort((a, b) => label(a).localeCompare(label(b), "nb", { numeric: true }));
  const sel = (id, felt, k, l) => `<label class="f">${esc(l)}<select id="${id}"><option value="">Ukjent / ikke i arkivet</option>${kand(k).map(x => `<option value="${x.id}" ${e[felt] === x.id ? "selected" : ""}>${esc(label(x))}${x.idnr && x.navn ? " – " + esc(x.idnr) : ""}${x.fodt ? " (" + x.fodt.slice(0, 4) + ")" : ""}${x.eier_id !== e.eier_id ? " · " + esc(arkivNavn(x.eier_id)) : ""}</option>`).join("")}</select></label>`;
  const arkiv = skrivbareArkiv();
  const kanVelgeArkiv = arkiv.length > 1 && (!e.id || erAdmin());
  return `<button class="btn sm back" data-act="avbryt">← Tilbake</button>
  <div class="card" style="margin-top:8px"><div class="eyebrow">${e.id ? "Rediger individ" : "Nytt individ"}</div><h2 style="font-size:1.5rem;margin-bottom:14px">${esc(e.id ? label(e) : "Registrer " + A.navn.toLowerCase())}</h2>
  <form class="grid" id="eform">
    <div class="full"><div class="eyebrow" style="margin-bottom:4px">Dyreslag</div><div class="seg">${Object.entries(ARTER).map(([k, a]) => `<button type="button" class="chip" data-act="setart" data-v="${k}" aria-pressed="${e.art === k}" ${e.id ? "disabled" : ""}>${esc(a.navn)}</button>`).join("")}</div></div>
    ${kanVelgeArkiv ? `<label class="f">Arkiv<select id="e-eier">${arkiv.map(id => `<option value="${id}" ${e.eier_id === id ? "selected" : ""}>${esc(arkivNavn(id))}</option>`).join("")}</select></label>` : ""}
    <label class="f">${esc(A.idLabel)}<input type="text" id="e-idnr" value="${esc(e.idnr || "")}" placeholder="${esc(A.idEksempel || "")}"></label>
    <label class="f">Navn<input type="text" id="e-navn" value="${esc(e.navn || "")}"></label>
    <label class="f">Kjønn<select id="e-kjonn"><option value="hunn" ${e.kjonn === "hunn" ? "selected" : ""}>${esc(A.hunn)}</option><option value="hann" ${e.kjonn === "hann" ? "selected" : ""}>${esc(A.hann)}</option></select></label>
    <label class="f">Fødselsdato<input type="date" id="e-fodt" value="${esc(e.fodt || "")}"></label>
    <label class="f">Rase<input type="text" id="e-rase" list="raser" value="${esc(e.rase || "")}" autocomplete="off"><datalist id="raser">${A.raser.map(r => `<option value="${esc(r)}">`).join("")}</datalist></label>
    <label class="f">Farge / tegning<input type="text" id="e-farge" value="${esc(e.farge || "")}"></label>
    ${A.ekstra.map(x => `<label class="f">${esc(x.l)}${x.opts ? `<select id="e-x-${x.k}">${x.opts.map(o => `<option ${ex(e, x.k) === o ? "selected" : ""} value="${esc(o)}">${o || "–"}</option>`).join("")}</select>` : `<input type="${x.type === "number" ? "number" : "text"}" step="0.1" id="e-x-${x.k}" value="${esc(ex(e, x.k))}">`}</label>`).join("")}
    <label class="f">Status<select id="e-status">${A.statuser.map(s => `<option ${(e.status || "Aktiv") === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label class="f">Statusdato (avgang)<input type="date" id="e-statusdato" value="${esc(e.status_dato || "")}"></label>
    <div class="full"><div class="eyebrow" style="margin:6px 0 2px">Foreldrerelasjon</div></div>
    ${sel("e-mor", "mor_id", "hunn", A.morL)}${sel("e-far", "far_id", "hann", A.farL)}
    <label class="f full">Merknad<textarea id="e-merknad" placeholder="Opphav, kjøpt fra, særtrekk, lynne …">${esc(e.merknad || "")}</textarea></label>
    <label class="f full">Bilde<input type="file" id="e-bilde" accept="image/jpeg,image/png,image/webp,image/heic">
      ${e._fil ? `<span class="muted">Valgt: ${esc(e._fil.name)}</span>` : bildeUrl(e) ? `<img src="${esc(bildeUrl(e))}" alt="" style="width:90px;height:90px;object-fit:cover;border-radius:8px;margin-top:6px">` : ""}</label>
    <div class="full actions"><button class="btn pri" type="submit" id="e-lagre">Lagre individ</button><button class="btn" type="button" data-act="avbryt">Avbryt</button></div>
  </form></div>`;
}
function lesSkjema() {
  const e = S.edit, A = A_(e), v = id => { const el = $("#" + id); return el ? el.value.trim() : ""; };
  const ekstra = { ...(e.ekstra || {}) };
  A.ekstra.forEach(x => { const val = v("e-x-" + x.k); if (val) ekstra[x.k] = val; else delete ekstra[x.k]; });
  return {
    art: e.art, eier_id: $("#e-eier") ? $("#e-eier").value : e.eier_id,
    idnr: v("e-idnr") || null, navn: v("e-navn") || null, kjonn: v("e-kjonn"), fodt: v("e-fodt") || null,
    rase: v("e-rase") || null, farge: v("e-farge") || null, status: v("e-status") || "Aktiv", status_dato: v("e-statusdato") || null,
    mor_id: v("e-mor") || null, far_id: v("e-far") || null, merknad: v("e-merknad") || null, ekstra
  };
}
async function lagreDyr(btn) {
  const o = lesSkjema(), e = S.edit;
  if (!o.idnr && !o.navn) { toast("Fyll inn " + A_(o).idLabel.toLowerCase() + " eller navn"); return; }
  if (o.mor_id && o.mor_id === o.far_id) { toast("Mor og far kan ikke være samme individ"); return; }
  vent(btn, true);
  try {
    const id = e.id || uuid();
    if (e.id) { const { error } = await S.sb.from("dyr").update(o).eq("id", id); if (error) throw error; }
    else { const { error } = await S.sb.from("dyr").insert({ id, ...o }); if (error) throw error; }
    if (e._fil) {
      const ext = (e._fil.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${o.eier_id}/${id}-${Date.now()}.${ext}`;
      const up = await S.sb.storage.from(BUCKET).upload(path, e._fil, { contentType: e._fil.type, upsert: false });
      if (up.error) throw new Error("Individet er lagret, men bildet ble ikke lastet opp: " + feil(up.error));
      const { error } = await S.sb.from("dyr").update({ bilde_path: path }).eq("id", id);
      if (error) throw error;
      if (e.bilde_path) S.sb.storage.from(BUCKET).remove([e.bilde_path]);
    }
    toast(e.id ? "Endringer lagret" : "Individ registrert");
    S.sel = id; S.edit = null; S.view = "dyr";
    await lastData();
  } catch (err) { toast(feil(err)); vent(btn, false); }
}

/* ---------- Felles observasjon ---------- */
function foInit() {
  const ark = skrivbareArkiv();
  const art = S.f.art !== "alle" ? S.f.art : "sau";
  S.fo = { eier: S.f.arkiv !== "alle" && ark.includes(S.f.arkiv) ? S.f.arkiv : S.me.id, art, kjonn: "alle", ung: "alle", q: "", valgt: new Set(), type: "Observasjon", dato: today(), verdi: "", tekst: "" };
}
const foKandidater = () => S.dyr.filter(d => d.eier_id === S.fo.eier && d.art === S.fo.art && erAktiv(d));
function foSynlige() {
  const fo = S.fo, q = fo.q.trim().toLowerCase();
  return foKandidater().filter(d => (fo.kjonn === "alle" || d.kjonn === fo.kjonn) && (fo.ung === "alle" || (fo.ung === "ung" ? erUng(d) : !erUng(d))) &&
    (!q || [d.navn, d.idnr, d.rase, d.farge].join(" ").toLowerCase().includes(q))).sort(SORT.id);
}
function fellesView() {
  if (!S.fo) foInit();
  const fo = S.fo, A = ARTER[fo.art], ark = skrivbareArkiv();
  const kand = foKandidater(), synl = foSynlige();
  const valgt = kand.filter(d => fo.valgt.has(d.id));
  const skjult = valgt.filter(d => !synl.includes(d)).length;
  if (!A.hendelser.some(h => h.n === fo.type)) fo.type = "Observasjon";
  const def = A.hendelser.find(h => h.n === fo.type) || {};
  return `<button class="btn sm back" data-act="nav" data-v="arkiv">← Arkiv</button>
  <div class="card" style="margin-top:8px"><div class="eyebrow">Registrering på flere individer</div><h2 style="font-size:1.5rem;margin-bottom:6px">Felles observasjon</h2>
    <p class="muted" style="margin:0 0 14px">Velg aktive individer i ett arkiv. Observasjonen lagres på hvert valgte individ når du trykker Registrer.</p>
    <div class="filters">
      ${ark.length > 1 ? `<label class="f">Arkiv${velg("fo-eier", ark.map(id => [id, arkivNavn(id)]), fo.eier, "Arkiv")}</label>` : ""}
      <div class="row">${Object.entries(ARTER).map(([k, a]) => chip("fo", "art", k, `${a.navn} ${S.dyr.filter(d => d.eier_id === fo.eier && d.art === k && erAktiv(d)).length}`, fo.art === k)).join("")}</div>
      <div class="row">${chip("fo", "kjonn", "alle", "Begge", fo.kjonn === "alle")}${chip("fo", "kjonn", "hunn", A.hunnP, fo.kjonn === "hunn")}${chip("fo", "kjonn", "hann", A.hannP, fo.kjonn === "hann")}
        <span style="width:8px"></span>${chip("fo", "ung", "alle", "Alle aldre", fo.ung === "alle")}${chip("fo", "ung", "ung", A.ungP + " i år", fo.ung === "ung")}${chip("fo", "ung", "voksen", "Voksne", fo.ung === "voksen")}</div>
      <input type="search" id="fo-q" placeholder="Søk i aktive ${esc(A.navn.toLowerCase())} …" value="${esc(fo.q)}" autocomplete="off" aria-label="Søk">
    </div>
    <div class="selbar"><b>${valgt.length} valgt</b><span class="muted">${synl.length} vises av ${kand.length} aktive${skjult ? ` · ${skjult} valgt er skjult av filteret` : ""}</span>
      <span class="sp"></span><button class="btn sm" data-act="fo-alle" ${synl.length ? "" : "disabled"}>Velg alle viste</button><button class="btn sm" data-act="fo-ingen" ${valgt.length ? "" : "disabled"}>Fjern alle</button></div>
    ${kand.length ? `<div class="selist">${synl.map(d => `<label class="selitem"><input type="checkbox" data-fo-id="${d.id}" ${fo.valgt.has(d.id) ? "checked" : ""}>${thumb(d)}<span class="t"><b>${esc(label(d))}</b><small>${esc([d.idnr && d.navn ? d.idnr : "", kjL(d), alder(d.fodt), d.rase].filter(Boolean).join(" · "))}</small></span></label>`).join("") || `<p class="muted" style="padding:10px">Ingen individer passer søket.</p>`}</div>`
      : `<div class="empty">Ingen aktive ${esc(A.navn.toLowerCase())} i ${esc(arkivNavn(fo.eier).toLowerCase())}.</div>`}
  </div>
  <form class="card grid" id="foform" style="margin-top:16px">
    <label class="f">Type${velg("fo-type", A.hendelser.map(h => [h.n, h.n]), fo.type, "Type")}</label>
    <label class="f">Dato<input type="date" id="fo-dato" value="${esc(fo.dato)}" required></label>
    ${def.v ? `<label class="f">${esc(def.v)} (samme for alle)<input type="text" inputmode="decimal" id="fo-verdi" value="${esc(fo.verdi)}"></label>` : ""}
    <label class="f full">Beskrivelse / observasjon<textarea id="fo-tekst" placeholder="F.eks. «Flokken flyttet til heimebeite, alle i godt hold»">${esc(fo.tekst)}</textarea></label>
    <div class="full actions" style="margin:0"><button class="btn pri" type="submit" ${valgt.length ? "" : "disabled"}>Registrer på ${valgt.length} individ${valgt.length === 1 ? "" : "er"}</button></div>
  </form>`;
}
async function lagreFelles(btn) {
  const fo = S.fo, ids = foKandidater().filter(d => fo.valgt.has(d.id)).map(d => d.id);
  if (!ids.length) { toast("Velg minst ett aktivt individ"); return; }
  if (!fo.dato) { toast("Velg dato"); return; }
  const fid = uuid();
  const rader = ids.map(id => ({ dyr_id: id, type: fo.type, dato: fo.dato, verdi: fo.verdi.trim() || null, tekst: fo.tekst.trim() || null, felles_id: fid }));
  vent(btn, true);
  try {
    for (let i = 0; i < rader.length; i += 500) { const { error } = await S.sb.from("hendelser").insert(rader.slice(i, i + 500)); if (error) throw error; }
    toast(`${fo.type} registrert på ${ids.length} individ${ids.length === 1 ? "" : "er"}`);
    fo.valgt = new Set(); fo.verdi = ""; fo.tekst = "";
    await lastData();
  } catch (e) { toast(feil(e)); vent(btn, false); }
}

/* ---------- Rapporter ---------- */
function pedCell(a, i, ff, visBilde) {
  const g = i < 4 ? 1 : i < 8 ? 2 : 3, p = i - 2 ** g, span = 8 / 2 ** g, id = a[i], d = id && byId(id);
  const st = `grid-column:${g};grid-row:${p * span + 1}/span ${span}`;
  if (!d) return `<div class="pc none" style="${st}"><div class="pct"><small>${ROLLER[i]}</small>Ukjent</div></div>`;
  const u = visBilde && bildeUrl(d);
  return `<button class="pc ${d.kjonn === "hann" ? "hann" : "hunn"} ${ff.has(id) ? "common" : ""} ${u ? "img g" + g : ""}" style="${st}" data-act="vis" data-id="${d.id}">${u ? `<img src="${esc(u)}" alt="">` : ""}<div class="pct"><small>${ROLLER[i]}${d.idnr ? " · " + esc(d.idnr) : ""}</small><b>${esc(label(d))}</b>${g === 1 && d.fodt ? `<small>${esc(kjL(d))} · født ${esc(d.fodt.slice(0, 4))}</small>` : ""}</div></button>`;
}
function rapportHode(d, tittel) {
  const u = S.opt.bildeRapport && bildeUrl(d);
  return `<div class="rhead">${u ? `<img class="rimg" src="${esc(u)}" alt="Bilde av ${esc(label(d))}">` : ""}<div style="min-width:0"><div class="eyebrow">${esc(tittel)} · ${fmtD(today())} · ${esc(arkivNavn(d.eier_id))}</div><h2 style="font-size:1.5rem">${esc(label(d))}</h2><div class="meta">${badges(d)}</div></div></div>`;
}
function rapportIndivid(d) {
  const A = A_(d), hs = hendFor(d.id), av = avkom(d.id);
  return `<div class="card">${rapportHode(d, "Individrapport")}
    <div class="sec"><dl class="kv">${[["Art", A.navn], [A.idLabel, d.idnr], ["Kjønn", kjL(d)], ["Født", fmtD(d.fodt)], ["Alder", alder(d.fodt)], ["Rase", d.rase], ["Farge", d.farge], ...A.ekstra.map(e => [e.l, ex(d, e.k)]), ["Status", d.status || "Aktiv"], d.status_dato ? ["Statusdato", fmtD(d.status_dato)] : null, [A.morL, label(byId(d.mor_id))], [A.farL, label(byId(d.far_id))], ["Antall avkom", String(av.length)], ["Siste vekt", sisteVekt(d.id)]].filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || "–")}</dd></div>`).join("")}</dl>
    ${d.merknad ? `<p style="margin:0;white-space:pre-wrap">${esc(d.merknad)}</p>` : ""}</div>
    <div class="sec"><h3>Hendelser og observasjoner (${hs.length})</h3>${hs.length ? `<div class="tw"><table class="t"><thead><tr><th>Dato</th><th>Type</th><th>Verdi</th><th>Beskrivelse</th></tr></thead><tbody>${hs.map(h => `<tr><td class="mono">${esc(h.dato)}</td><td>${esc(h.type)}${h.felles_id ? ' <span class="pill felles">Felles</span>' : ""}</td><td>${esc(h.verdi || "")}</td><td>${esc(h.tekst || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen registrerte hendelser.</p>`}</div></div>`;
}
function rapportRelasjon(d) {
  const A = A_(d), a = stamtre(d.id), fl = felles(d), ff = new Set(fl.map(x => x.id)), av = avkom(d.id), so = sosken(d), vb = S.opt.bildeRelasjon;
  const tc = x => vb ? `<td class="tdimg">${thumb(x, true, "tthumb")}</td>` : "";
  const th = vb ? "<th></th>" : "";
  return `<div class="card">${rapportHode(d, "Relasjonsrapport")}
    <div class="sec"><h3>Stamtavle, tre generasjoner</h3><div class="pedwrap"><div class="ped ${vb ? "medbilde" : ""}">${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(i => pedCell(a, i, ff, vb)).join("")}</div></div>
    ${fl.length ? `<div class="warn"><b>Innavlsvarsel.</b> Felles aner på fars- og morsside: ${fl.map(x => `${esc(label(byId(x.id)))} (gen. ${x.gf} på farsside, ${x.gm} på morsside)`).join("; ")}. Felles aner er markert i stamtavla.</div>` : `<p class="muted" style="margin:0">Ingen felles aner funnet mellom far og mor i registrerte generasjoner.</p>`}</div>
    <div class="sec"><h3>Avkom (${av.length})</h3>${av.length ? `<div class="tw"><table class="t"><thead><tr>${th}<th>${esc(A.idLabel)}</th><th>Navn</th><th>Kjønn</th><th>Født</th><th>Andre forelder</th><th>Egne avkom</th><th>Status</th></tr></thead><tbody>${av.map(x => { const o = byId(x.mor_id === d.id ? x.far_id : x.mor_id); return `<tr>${tc(x)}<td class="mono">${esc(x.idnr || "")}</td><td>${esc(x.navn || "")}</td><td>${esc(kjL(x))}</td><td class="mono">${esc(x.fodt || "")}</td><td>${esc(label(o) || "–")}</td><td>${avkom(x.id).length}</td><td>${esc(x.status || "Aktiv")}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen avkom registrert.</p>`}</div>
    <div class="sec"><h3>Søsken (${so.length})</h3>${so.length ? `<div class="tw"><table class="t"><thead><tr>${th}<th>Navn / ID</th><th>Relasjon</th><th>Kjønn</th><th>Født</th></tr></thead><tbody>${so.map(x => `<tr>${tc(x.d)}<td>${esc(label(x.d))}${x.d.idnr && x.d.navn ? ` <span class="mono muted">${esc(x.d.idnr)}</span>` : ""}</td><td>${x.hel ? "Helsøsken" : "Halvsøsken"}</td><td>${esc(kjL(x.d))}</td><td class="mono">${esc(x.d.fodt || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen søsken registrert.</p>`}</div></div>`;
}

/* Besetning: alle individer av valgt art som var aktive på et tidspunkt i perioden. */
function besetning() {
  const r = S.rap, fra = r.fra || "0000-01-01", til = r.til || today(), A = ARTER[r.art];
  const grunn = S.dyr.filter(d => d.art === r.art && (r.arkiv === "alle" || d.eier_id === r.arkiv));
  const utenDato = grunn.filter(d => !erAktiv(d) && !d.status_dato).length;
  const dyr = grunn.filter(d => (!d.fodt || d.fodt <= til) && (erAktiv(d) || (d.status_dato && d.status_dato >= fra))).sort(SORT.id)
    .map(d => {
      const avgang = !erAktiv(d) && d.status_dato && d.status_dato <= til;
      const hend = S.hend.filter(h => h.dyr_id === d.id && h.dato >= fra && h.dato <= til);
      return { d, født: d.fodt && d.fodt >= fra, avgang, statusVed: avgang ? d.status : "Aktiv", hend, vekt: sisteVekt(d.id, til) };
    });
  const vedSlutt = dyr.filter(x => !x.avgang);
  const avgangPer = {};
  dyr.filter(x => x.avgang).forEach(x => { avgangPer[x.statusVed] = (avgangPer[x.statusVed] || 0) + 1; });
  const typer = {};
  dyr.forEach(x => x.hend.forEach(h => { typer[h.type] = (typer[h.type] || 0) + 1; }));
  return {
    A, fra, til, dyr, utenDato, avgangPer, typer,
    sum: [["I perioden", dyr.length], ["Ved start", dyr.filter(x => !x.født).length], ["Født i perioden", dyr.filter(x => x.født).length],
      ["Avgang", dyr.filter(x => x.avgang).length], ["Ved slutt", vedSlutt.length]],
    kjønn: [[A.hunnP, vedSlutt.filter(x => x.d.kjonn === "hunn").length], [A.hannP, vedSlutt.filter(x => x.d.kjonn === "hann").length]]
  };
}
function rapportBesetning() {
  const b = besetning(), r = S.rap, vb = S.opt.bildeRapport;
  return `<div class="card"><div class="eyebrow">Besetningsrapport · ${esc(b.A.navn)} · ${esc(r.arkiv === "alle" ? "Alle arkiv" : arkivNavn(r.arkiv))}</div>
    <h2 style="font-size:1.5rem">${fmtD(b.fra)} – ${fmtD(b.til)}</h2>
    <div class="stats five" style="margin-top:12px">${b.sum.map(([l, n]) => `<div class="stat"><b>${n}</b><span>${esc(l)}</span></div>`).join("")}</div>
    <p class="muted" style="margin:0;font-size:.88rem">Ved periodeslutt: ${b.kjønn.map(([l, n]) => `${n} ${esc(l.toLowerCase())}`).join(", ")}.
      ${Object.keys(b.avgangPer).length ? ` Avgang: ${Object.entries(b.avgangPer).map(([s, n]) => `${n} ${esc(s.toLowerCase())}`).join(", ")}.` : ""}
      ${b.utenDato ? ` ${b.utenDato} individ${b.utenDato === 1 ? "" : "er"} med avgangsstatus uten statusdato er ikke tatt med.` : ""}</p>
    <div class="sec"><h3>Individer (${b.dyr.length})</h3>
    ${b.dyr.length ? `<div class="tw"><table class="t"><thead><tr>${vb ? "<th></th>" : ""}<th>${esc(b.A.idLabel)}</th><th>Navn</th><th>Kjønn</th><th>Født</th><th>Rase</th><th>Mor</th><th>Far</th><th>Status</th><th>Hendelser</th><th>Siste vekt</th></tr></thead><tbody>
      ${b.dyr.map(x => `<tr class="clickrow" data-act="vis" data-id="${x.d.id}">${vb ? `<td class="tdimg">${thumb(x.d, true, "tthumb")}</td>` : ""}<td class="mono">${esc(x.d.idnr || "")}</td><td>${esc(x.d.navn || "")}</td><td>${esc(kjL(x.d))}</td><td class="mono">${esc(x.d.fodt || "")}${x.født ? ' <span class="pill lam">Ny</span>' : ""}</td><td>${esc(x.d.rase || "")}</td><td>${esc(label(byId(x.d.mor_id)) || "–")}</td><td>${esc(label(byId(x.d.far_id)) || "–")}</td><td>${esc(x.statusVed)}${x.avgang ? ` <span class="mono muted">${esc(x.d.status_dato)}</span>` : ""}</td><td>${x.hend.length}</td><td>${esc(x.vekt)}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted" style="margin:0">Ingen ${esc(b.A.navn.toLowerCase())} var aktive i perioden.</p>`}</div>
    ${Object.keys(b.typer).length ? `<div class="sec"><h3>Hendelser i perioden</h3><div class="tw"><table class="t"><thead><tr><th>Type</th><th>Antall</th></tr></thead><tbody>${Object.entries(b.typer).sort((a, c) => c[1] - a[1]).map(([t, n]) => `<tr><td>${esc(t)}</td><td>${n}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
  </div>`;
}
function rapporter() {
  const r = S.rap;
  if (!r.til) r.til = today();
  const liste = filtrert();
  if (r.id && !liste.some(x => x.id === r.id) && byId(r.id)) liste.unshift(byId(r.id));
  const d = byId(r.id), erInd = r.type !== "besetning";
  const klar = erInd ? !!d : true;
  const valgIndivid = `<select id="rap-id" aria-label="Velg individ"><option value="">Velg individ (${liste.length} i filteret) …</option>${liste.map(x => `<option value="${x.id}" ${x.id === r.id ? "selected" : ""}>${esc(label(x))}${x.idnr && x.navn ? " – " + esc(x.idnr) : ""} (${esc(A_(x).navn)}${x.eier_id !== S.me.id ? ", " + esc(arkivNavn(x.eier_id)) : ""})</option>`).join("")}</select>`;
  const valgBes = `<div class="row2">
      <label class="f">Dyreslag${velg("rap-art", Object.entries(ARTER).map(([k, a]) => [k, a.navn]), r.art, "Dyreslag")}</label>
      <label class="f">Arkiv${velg("rap-arkiv", [["alle", "Alle arkiv jeg har tilgang til"], ...lesbareArkiv().map(id => [id, arkivNavn(id)])], r.arkiv, "Arkiv")}</label>
      <label class="f">Fra<input type="date" id="rap-fra" value="${esc(r.fra)}"></label>
      <label class="f">Til<input type="date" id="rap-til" value="${esc(r.til)}"></label></div>
      <div class="row">${[["ar", "I år"], ["ifjor", "I fjor"], ["12m", "Siste 12 mnd"]].map(([k, l]) => `<button class="chip" data-act="rapperiode" data-v="${k}">${l}</button>`).join("")}</div>`;
  const innhold = r.type === "besetning" ? rapportBesetning() : d ? (r.type === "individ" ? rapportIndivid(d) : rapportRelasjon(d))
    : `<div class="card empty"><h3>Ingen rapport valgt</h3>Velg et individ over. Listen følger filteret i arkivet.</div>`;
  return `<button class="btn sm back" data-act="nav" data-v="arkiv">← Arkiv</button>
  <div class="card noprint" style="margin-top:8px"><div class="eyebrow">Rapporter</div><h2 style="font-size:1.5rem;margin-bottom:12px">Ta ut rapport</h2>
    <div class="filters">
    <div class="row">${[["individ", "Individrapport"], ["relasjon", "Relasjonsrapport"], ["besetning", "Besetningsrapport"]].map(([k, l]) => `<button class="chip" data-act="raptype" data-v="${k}" aria-pressed="${r.type === k}">${l}</button>`).join("")}</div>
    ${erInd ? valgIndivid : valgBes}
    <div class="row opts">${sjekk("opt-bilde", S.opt.bildeRapport, r.type === "besetning" ? "Ta med bilde av hvert individ" : "Ta med bilde av individet")}
      ${r.type === "relasjon" ? sjekk("opt-relbilde", S.opt.bildeRelasjon, "Vis bilder av far, mor, aner, avkom og søsken") : ""}</div>
    <div class="row"><button class="btn sm pri" data-act="pdf" ${klar ? "" : "disabled"}>Last ned PDF</button><button class="btn sm" data-act="print" ${klar ? "" : "disabled"}>Skriv ut</button><button class="btn sm" data-act="csvrap" ${klar ? "" : "disabled"}>Last ned CSV</button></div>
    <div class="row"><button class="btn sm" data-act="csvalle">Arkivlisten som CSV (${filtrert().length})</button><button class="btn sm" data-act="csvhend">Alle hendelser som CSV</button></div></div></div>
  <div style="margin-top:12px">${innhold}</div>`;
}
function settPeriode(k) {
  const y = new Date().getFullYear();
  if (k === "ar") { S.rap.fra = y + "-01-01"; S.rap.til = today(); }
  if (k === "ifjor") { S.rap.fra = (y - 1) + "-01-01"; S.rap.til = (y - 1) + "-12-31"; }
  if (k === "12m") { const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); S.rap.fra = d.toISOString().slice(0, 10); S.rap.til = today(); }
}

/* ---------- Eksport: CSV ---------- */
function lastNed(navn, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = navn; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast("Lastet ned " + navn);
}
const csv = rows => "﻿" + rows.map(r => r.map(v => { v = String(v ?? ""); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(";")).join("\r\n");
const lagreCsv = (navn, rows) => lastNed(navn, csv(rows), "text/csv;charset=utf-8");
const filnavn = d => (label(d) || "individ").replace(/[^\wæøåÆØÅ-]+/g, "_");
const alleEkstra = () => [...new Set(Object.values(ARTER).flatMap(a => a.ekstra.map(e => e.k)))];
function csvAlle() {
  const ek = alleEkstra(), liste = filtrert();
  lagreCsv("flokkboka_arkiv_" + today() + ".csv", [["id", "arkiv", "art", "idnr", "navn", "kjonn", "fodt", "rase", "farge", "status", "statusdato", "mor_id", "mor", "far_id", "far", "antall_avkom", ...ek, "merknad"],
    ...liste.map(d => [d.id, arkivNavn(d.eier_id), d.art, d.idnr, d.navn, kjL(d), d.fodt, d.rase, d.farge, d.status || "Aktiv", d.status_dato, d.mor_id, label(byId(d.mor_id)), d.far_id, label(byId(d.far_id)), avkom(d.id).length, ...ek.map(k => ex(d, k)), d.merknad])]);
}
const csvHendRader = list => [["dyr_id", "dyr", "idnr", "art", "dato", "type", "verdi", "beskrivelse", "felles_id", "registrert_av"], ...list.map(h => { const d = byId(h.dyr_id) || {}; return [h.dyr_id, label(d), d.idnr, d.art, h.dato, h.type, h.verdi, h.tekst, h.felles_id, h.registrert_av ? pNavn(h.registrert_av) : ""]; })];
function csvRapport() {
  const r = S.rap;
  if (r.type === "besetning") {
    const b = besetning();
    lagreCsv(`flokkboka_besetning_${r.art}_${b.fra}_${b.til}.csv`, [["idnr", "navn", "kjonn", "fodt", "fodt_i_perioden", "rase", "mor", "far", "status_ved_slutt", "statusdato", "hendelser_i_perioden", "siste_vekt"],
      ...b.dyr.map(x => [x.d.idnr, x.d.navn, kjL(x.d), x.d.fodt, x.født ? "ja" : "nei", x.d.rase, label(byId(x.d.mor_id)), label(byId(x.d.far_id)), x.statusVed, x.avgang ? x.d.status_dato : "", x.hend.length, x.vekt])]);
    return;
  }
  const d = byId(r.id); if (!d) return;
  if (r.type === "individ") { lagreCsv(filnavn(d) + "_hendelser.csv", csvHendRader(hendFor(d.id))); return; }
  const a = stamtre(d.id), rows = [["relasjon", "id", "idnr", "navn", "kjonn", "fodt"]];
  for (let i = 1; i < 16; i++) { const x = byId(a[i]); if (x) rows.push([ROLLER[i], x.id, x.idnr, x.navn, kjL(x), x.fodt]); }
  avkom(d.id).forEach(x => rows.push(["Avkom", x.id, x.idnr, x.navn, kjL(x), x.fodt]));
  sosken(d).forEach(s => rows.push([s.hel ? "Helsøsken" : "Halvsøsken", s.d.id, s.d.idnr, s.d.navn, kjL(s.d), s.d.fodt]));
  lagreCsv(filnavn(d) + "_relasjoner.csv", rows);
}

/* ---------- Eksport: PDF ---------- */
function nyPdf(orientation = "portrait") {
  const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 15;
  const P = { doc, W, H, M, y: 18 };
  P.plass = h => { if (P.y + h > H - 14) { doc.addPage(); P.y = 18; return true; } return false; };
  P.font = (s, b, farge = 20) => { doc.setFont("helvetica", b ? "bold" : "normal"); doc.setFontSize(s); doc.setTextColor(farge); };
  P.linje = (t, o = {}) => {
    P.font(o.s || 10, o.b, o.c ?? 20);
    const ls = doc.splitTextToSize(String(t ?? ""), o.w || (W - 2 * M - ((o.x || M) - M)));
    ls.forEach(l => { P.plass((o.s || 10) * 0.45); doc.text(l, o.x || M, P.y); P.y += (o.s || 10) * 0.45; });
    P.y += o.gap ?? 1.5;
  };
  P.kort = (t, w) => { const s = String(t ?? ""); if (doc.getTextWidth(s) <= w) return s; let x = s; while (x.length > 1 && doc.getTextWidth(x + "…") > w) x = x.slice(0, -1); return x + "…"; };
  P.bilde = (b, x, y, maxW, maxH, topp = false) => {
    if (!b) return 0;
    const s = Math.min(maxW / b.w, maxH / b.h), w = b.w * s, h = b.h * s;
    try { doc.addImage(b.data, "JPEG", x + (maxW - w) / 2, topp ? y : y + (maxH - h) / 2, w, h); } catch (e) { return 0; }
    return h;
  };
  P.hode = (type, linje2, tittel, under) => {
    doc.setFillColor(242, 194, 48); doc.rect(M, 10, W - 2 * M, 1.6, "F");
    P.linje(`Flokkboka · ${type} · ${fmtD(today())}${linje2 ? " · " + linje2 : ""}`, { s: 9, c: 90, gap: 2 });
    P.linje(tittel, { s: 18, b: true, gap: 2 });
    if (under) P.linje(under, { s: 10, c: 60, gap: 4 });
  };
  P.seksjon = t => { P.plass(14); P.y += 3; P.linje(t, { s: 12, b: true, gap: 2.5 }); };
  P.fot = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); P.font(8, false, 120); doc.text(`Flokkboka · side ${i} av ${n}`, W - M, H - 8, { align: "right" }); }
  };
  return P;
}
async function pdf(btn) {
  if (!window.jspdf) { toast("PDF-biblioteket ble ikke lastet. Sjekk nettforbindelsen."); return; }
  vent(btn, true); const t0 = btn && btn.textContent; if (btn) btn.textContent = "Lager PDF …";
  try {
    const r = S.rap;
    if (r.type === "besetning") await pdfBesetning();
    else { const d = byId(r.id); if (d) await (r.type === "individ" ? pdfIndivid(d) : pdfRelasjon(d)); }
  } catch (e) { toast("Kunne ikke lage PDF: " + feil(e)); }
  if (btn) { btn.textContent = t0; vent(btn, false); }
}
function kvPdf(P, rader, xV, wV) {
  rader.forEach(([k, v]) => {
    const ls = P.doc.splitTextToSize(String(v || "–"), wV);
    P.plass(5.5 * ls.length);
    P.font(9, false, 110); P.doc.text(k, P.M, P.y);
    P.font(10, false, 20); P.doc.text(ls, xV, P.y);
    P.y += 5.2 * ls.length;
  });
}
async function pdfIndivid(d) {
  const A = A_(d), P = nyPdf();
  const b = S.opt.bildeRapport ? await bildeData(d, 900) : null;
  P.hode("Individrapport", arkivNavn(d.eier_id), label(d), `${A.navn} · ${kjL(d)}${d.idnr ? " · " + d.idnr : ""} · ${d.status || "Aktiv"}`);
  const y0 = P.y, bW = 62;
  const bh = b ? P.bilde(b, P.W - P.M - bW, y0 - 4, bW, 62, true) : 0;
  kvPdf(P, [[A.idLabel, d.idnr], ["Født", fmtD(d.fodt)], ["Alder", alder(d.fodt)], ["Rase", d.rase], ["Farge", d.farge], ...A.ekstra.map(e => [e.l, ex(d, e.k)]),
    ["Status", d.status || "Aktiv"], ["Statusdato", d.status_dato ? fmtD(d.status_dato) : ""], [A.morL, label(byId(d.mor_id))], [A.farL, label(byId(d.far_id))],
    ["Antall avkom", String(avkom(d.id).length)], ["Siste vekt", sisteVekt(d.id)]], 58, b ? P.W - 2 * P.M - 43 - bW - 4 : 125);
  P.y = Math.max(P.y, y0 + bh);
  if (d.merknad) { P.y += 2; P.linje("Merknad", { s: 9, c: 110, gap: 1 }); P.linje(d.merknad, { gap: 2 }); }
  const hs = hendFor(d.id);
  P.seksjon(`Hendelser og observasjoner (${hs.length})`);
  if (!hs.length) P.linje("Ingen registrerte hendelser.", { c: 110 });
  hs.forEach(h => { P.plass(10); P.linje(`${h.dato}   ${h.type}${h.verdi ? "  (" + h.verdi + ")" : ""}${h.felles_id ? "   · felles" : ""}`, { b: true, gap: .6 }); if (h.tekst) P.linje(h.tekst, { x: P.M + 5, c: 60, gap: 2.2 }); });
  P.fot();
  lastNed(filnavn(d) + "_individrapport.pdf", P.doc.output("blob"));
}
async function pdfRelasjon(d) {
  const A = A_(d), P = nyPdf(), doc = P.doc;
  const a = stamtre(d.id), ff = new Set(felles(d).map(x => x.id)), av = avkom(d.id), so = sosken(d), vb = S.opt.bildeRelasjon;
  const hb = S.opt.bildeRapport ? await bildeData(d, 700) : null;
  if (vb) await forhånd([...a.slice(2).map(byId), ...av, ...so.map(x => x.d)], 300);
  P.hode("Relasjonsrapport", arkivNavn(d.eier_id), label(d), `${A.navn} · ${kjL(d)}${d.idnr ? " · " + d.idnr : ""}${d.fodt ? " · født " + fmtD(d.fodt) : ""} · ${d.status || "Aktiv"}`);
  if (hb) { P.bilde(hb, P.W - P.M - 34, 13, 34, 26); }
  P.seksjon("Stamtavle, tre generasjoner");
  const slot = vb ? 13 : 10, gap = 4, colW = (P.W - 2 * P.M - 2 * gap) / 3;
  P.plass(8 * slot + 4);
  const top = P.y - 2;
  for (let i = 2; i < 16; i++) {
    const g = i < 4 ? 1 : i < 8 ? 2 : 3, p = i - 2 ** g, span = 8 / 2 ** g;
    const x = P.M + (g - 1) * (colW + gap), y = top + p * span * slot, h = span * slot - 1.6;
    const x2 = byId(a[i]);
    doc.setDrawColor(190); doc.setLineWidth(0.2);
    if (x2 && ff.has(x2.id)) { doc.setFillColor(246, 225, 218); doc.rect(x, y, colW, h, "FD"); } else doc.rect(x, y, colW, h);
    if (x2) { if (x2.kjonn === "hann") doc.setFillColor(60, 99, 133); else doc.setFillColor(138, 74, 107); doc.rect(x, y, 1.2, h, "F"); }
    let tx = x + 3.5;
    const b = vb && x2 ? S.bildeData[x2.bilde_path] : null;
    if (b) { const s = Math.min(h - 2, 22); P.bilde(b, x + 2.5, y + (h - s) / 2, s, s); tx = x + 2.5 + s + 2.5; }
    const tw = x + colW - tx - 2, my = y + h / 2;
    P.font(7, false, 110); doc.text(P.kort(ROLLER[i] + (x2 && x2.idnr ? " · " + x2.idnr : ""), tw), tx, my - 1);
    P.font(9, !!x2, x2 ? 20 : 140); doc.text(P.kort(x2 ? label(x2) : "Ukjent", tw), tx, my + 3.4);
  }
  P.y = top + 8 * slot + 4;
  if (ff.size) P.linje("Innavlsvarsel: felles aner hos far og mor – " + [...ff].map(i => label(byId(i))).join(", ") + ". Markert med farge i stamtavla.", { b: true, c: 140, gap: 2 });
  const liste = (rader, tekst) => rader.forEach(x => {
    const b = vb ? S.bildeData[x.bilde_path] : null, rh = vb ? 12 : 6;
    P.plass(rh);
    let tx = P.M;
    if (vb) { if (b) P.bilde(b, P.M, P.y - 4, 10, 10); else { doc.setDrawColor(200); doc.rect(P.M, P.y - 4, 10, 10); } tx = P.M + 13; }
    P.font(10, true, 20); doc.text(P.kort(label(x), 55), tx, P.y + (vb ? 0 : 0));
    P.font(9, false, 70); doc.text(P.kort(tekst(x), P.W - P.M - tx - 58), tx + 58, P.y);
    P.y += rh;
  });
  P.seksjon(`Avkom (${av.length})`);
  if (!av.length) P.linje("Ingen avkom registrert.", { c: 110 });
  liste(av, x => [x.idnr, kjL(x), x.fodt ? "født " + x.fodt : "", "andre forelder: " + (label(byId(x.mor_id === d.id ? x.far_id : x.mor_id)) || "–"), "egne avkom: " + avkom(x.id).length, x.status || "Aktiv"].filter(Boolean).join(" · "));
  P.seksjon(`Søsken (${so.length})`);
  if (!so.length) P.linje("Ingen søsken registrert.", { c: 110 });
  const hel = new Set(so.filter(s => s.hel).map(s => s.d.id));
  liste(so.map(s => s.d), x => [hel.has(x.id) ? "Helsøsken" : "Halvsøsken", x.idnr, kjL(x), x.fodt ? "født " + x.fodt : ""].filter(Boolean).join(" · "));
  P.fot();
  lastNed(filnavn(d) + "_relasjonsrapport.pdf", doc.output("blob"));
}
async function pdfBesetning() {
  const b = besetning(), r = S.rap, vb = S.opt.bildeRapport, P = nyPdf("landscape"), doc = P.doc;
  if (vb) await forhånd(b.dyr.map(x => x.d), 240);
  P.hode("Besetningsrapport", r.arkiv === "alle" ? "Alle arkiv" : arkivNavn(r.arkiv), `${b.A.navn} · ${fmtD(b.fra)} – ${fmtD(b.til)}`,
    b.sum.map(([l, n]) => `${l}: ${n}`).join("   ·   "));
  P.linje(`Ved periodeslutt: ${b.kjønn.map(([l, n]) => `${n} ${l.toLowerCase()}`).join(", ")}.${Object.keys(b.avgangPer).length ? " Avgang: " + Object.entries(b.avgangPer).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(", ") + "." : ""}${b.utenDato ? ` ${b.utenDato} med avgangsstatus uten statusdato er ikke tatt med.` : ""}`, { s: 9, c: 70, gap: 4 });
  const kol = [...(vb ? [["", 11]] : []), [b.A.idLabel, 34], ["Navn", 28], ["Kjønn", 20], ["Født", 22], ["Rase", 32], ["Mor", 28], ["Far", 28], ["Status", 30], ["Hend.", 13], ["Siste vekt", 34]];
  const sumW = kol.reduce((s, k) => s + k[1], 0), skala = (P.W - 2 * P.M) / sumW;
  kol.forEach(k => k[1] *= skala);
  const rh = vb ? 11 : 6.2;
  const hode = () => { P.font(8, true, 90); let x = P.M; kol.forEach(([t, w]) => { doc.text(P.kort(t, w - 1.5), x, P.y); x += w; }); P.y += 1.5; doc.setDrawColor(170); doc.line(P.M, P.y, P.W - P.M, P.y); P.y += 4.3; };
  hode();
  b.dyr.forEach(x => {
    if (P.plass(rh)) hode();
    const d = x.d, celler = [d.idnr, d.navn, kjL(d), (d.fodt || "") + (x.født ? " *" : ""), d.rase, label(byId(d.mor_id)), label(byId(d.far_id)), x.statusVed + (x.avgang ? " " + d.status_dato : ""), String(x.hend.length), x.vekt === "–" ? "" : x.vekt];
    let cx = P.M;
    if (vb) { const bd = S.bildeData[d.bilde_path]; if (bd) P.bilde(bd, cx, P.y - 4.2, 9, 9); cx += kol[0][1]; }
    P.font(8.5, false, 20);
    celler.forEach((c, i) => { const w = kol[i + (vb ? 1 : 0)][1]; doc.text(P.kort(c || "", w - 1.5), cx, P.y); cx += w; });
    doc.setDrawColor(225); doc.line(P.M, P.y + rh - 4.5, P.W - P.M, P.y + rh - 4.5);
    P.y += rh;
  });
  if (!b.dyr.length) P.linje(`Ingen ${b.A.navn.toLowerCase()} var aktive i perioden.`, { c: 110 });
  else P.linje("* født i perioden", { s: 8, c: 110, gap: 2 });
  if (Object.keys(b.typer).length) {
    P.seksjon("Hendelser i perioden");
    Object.entries(b.typer).sort((a, c) => c[1] - a[1]).forEach(([t, n]) => P.linje(`${t}: ${n}`, { gap: .5 }));
  }
  P.fot();
  lastNed(`flokkboka_besetning_${r.art}_${b.fra}_${b.til}.pdf`, doc.output("blob"));
}

/* ---------- Excel-mal og import ---------- */
function malKolonner(art) {
  const A = ARTER[art];
  const artNavn = Object.values(ARTER).map(a => a.navn).join(", ");
  return [
    { k: "idnr", h: "ID-nr *", maa: true, besk: `${A.idLabel}. Unik i arkivet per dyreslag. Brukes til å koble mor og far.`, fmt: "Tekst", eks: A.idEksempel.replace("f.eks. ", "") },
    { k: "kjonn", h: "Kjønn *", maa: true, besk: "Kjønn på individet.", fmt: `${A.hunn} eller ${A.hann}${A.hannKastrert ? " (eller " + A.hannKastrert + ")" : ""}. Hunn/hann godtas også.`, eks: A.hunn },
    { k: "art", h: "Dyreslag", besk: "Tom celle = dyreslaget malen er laget for.", fmt: artNavn, eks: A.navn },
    { k: "navn", h: "Navn", besk: "Navn eller kallenavn.", fmt: "Tekst", eks: art === "hund" ? "Tess" : art === "hest" ? "Blakken" : "Rosa" },
    { k: "fodt", h: "Fødselsdato", besk: "Kan ikke være fram i tid.", fmt: "Dato: dd.mm.åååå eller åååå-mm-dd", eks: "28.04.2025" },
    { k: "rase", h: "Rase", besk: "Fritekst. Se arket «Gyldige verdier» for vanlige raser.", fmt: "Tekst", eks: A.raser[0] },
    { k: "farge", h: "Farge/tegning", besk: "Fritekst.", fmt: "Tekst", eks: "" },
    { k: "status", h: "Status", besk: "Tom celle = Aktiv for nye individer.", fmt: A.statuser.join(", "), eks: "Aktiv" },
    { k: "status_dato", h: "Statusdato", besk: "Dato for salg, slakt, død o.l. Trengs for besetningsrapport.", fmt: "Dato", eks: "" },
    { k: "mor", h: "Mor ID-nr", besk: "ID-nr til mor. Kan være i samme fil eller allerede i Flokkboka.", fmt: "Tekst", eks: "" },
    { k: "far", h: "Far ID-nr", besk: "ID-nr til far. Kan være i samme fil eller allerede i Flokkboka.", fmt: "Tekst", eks: "" },
    ...A.ekstra.map(e => ({ k: "x:" + e.k, h: e.l, besk: e.type === "number" ? "Tall. Komma eller punktum." : "", fmt: e.opts ? e.opts.filter(Boolean).join(", ") : e.type === "number" ? "Tall" : "Tekst", eks: e.opts ? e.opts[1] : "" })),
    { k: "merknad", h: "Merknad", besk: "Fritekst.", fmt: "Tekst", eks: "" }
  ];
}
const hNorm = h => String(h ?? "").toLowerCase().replace(/\*/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9æøå]/g, "");
function lastNedMal(art, eier, medDyr) {
  if (!window.XLSX) { toast("Excel-biblioteket ble ikke lastet. Sjekk nettforbindelsen."); return; }
  const A = ARTER[art], kol = malKolonner(art), X = window.XLSX;
  const rader = [kol.map(k => k.h)];
  if (medDyr) S.dyr.filter(d => d.eier_id === eier && d.art === art).sort(SORT.id).forEach(d => {
    rader.push(kol.map(k => {
      if (k.k === "kjonn") return kjL(d);
      if (k.k === "art") return A.navn;
      if (k.k === "mor") return (byId(d.mor_id) || {}).idnr || "";
      if (k.k === "far") return (byId(d.far_id) || {}).idnr || "";
      if (k.k === "fodt" || k.k === "status_dato") { const v = d[k.k]; return v ? v.split("-").reverse().join(".") : ""; }
      if (k.k.startsWith("x:")) return ex(d, k.k.slice(2));
      return d[k.k] ?? "";
    }));
  });
  const ws = X.utils.aoa_to_sheet(rader);
  ws["!cols"] = kol.map(k => ({ wch: Math.max(12, k.h.length + 3) }));
  ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rader.length - 1, 1), c: kol.length - 1 } }) };
  const vei = [[`Flokkboka – importmal for ${A.navn.toLowerCase()}`], [`Fyll inn ett individ per rad i arket «Besetning». Kolonner merket * må fylles ut. Ikke endre overskriftene.`],
    [`Finnes ID-nr allerede i arkivet, oppdateres individet. Tomme celler endrer ikke eksisterende verdier.`], [],
    ["Kolonne", "Påkrevd", "Beskrivelse", "Gyldige verdier / format", "Eksempel"],
    ...kol.map(k => [k.h.replace(" *", ""), k.maa ? "MÅ" : "Kan", k.besk, k.fmt, k.eks])];
  const wsV = X.utils.aoa_to_sheet(vei);
  wsV["!cols"] = [{ wch: 20 }, { wch: 9 }, { wch: 62 }, { wch: 48 }, { wch: 22 }];
  const lister = [["Kjønn", [A.hunn, A.hann, ...(A.hannKastrert ? [A.hannKastrert] : [])]], ["Status", A.statuser], ["Rase", A.raser],
    ...A.ekstra.filter(e => e.opts).map(e => [e.l, e.opts.filter(Boolean)])];
  const maks = Math.max(...lister.map(l => l[1].length));
  const gv = [lister.map(l => l[0]), ...Array.from({ length: maks }, (_, i) => lister.map(l => l[1][i] || ""))];
  const wsG = X.utils.aoa_to_sheet(gv);
  wsG["!cols"] = lister.map(() => ({ wch: 26 }));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, "Besetning");
  X.utils.book_append_sheet(wb, wsV, "Veiledning");
  X.utils.book_append_sheet(wb, wsG, "Gyldige verdier");
  const navn = `flokkboka_${medDyr ? "besetning" : "mal"}_${art}${medDyr ? "_" + today() : ""}.xlsx`;
  X.writeFile(wb, navn);
  toast("Lastet ned " + navn);
}
function excelDato(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") { if (v < 1 || v > 80000) return undefined; return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10); }
  const s = String(v).trim();
  let y, m, d, t;
  if ((t = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [, y, m, d] = t;
  else if ((t = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/))) { [, d, m, y] = t; if (y.length === 2) y = (+y > new Date().getFullYear() % 100 ? "19" : "20") + y; }
  else return undefined;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(iso + "T12:00:00Z");
  return isNaN(dt) || dt.toISOString().slice(0, 10) !== iso ? undefined : iso;
}
function tolkKjønn(v, art) {
  const s = norm(v), A = ARTER[art];
  if (!s) return null;
  if (["hunn", "f", "female", "hunndyr", norm(A.hunn)].includes(s)) return { kjonn: "hunn" };
  if (["hann", "m", "male", "hanndyr", norm(A.hann)].includes(s)) return { kjonn: "hann" };
  if (A.hannKastrert && s === norm(A.hannKastrert)) return { kjonn: "hann", vallak: "Ja" };
  return undefined;
}
function tolkArt(v, standard) {
  const s = norm(v);
  if (!s) return standard;
  const e = Object.entries(ARTER).find(([k, a]) => s === k || s === norm(a.navn));
  return e ? e[0] : undefined;
}
async function lesFil(fil) {
  const X = window.XLSX, imp = S.imp;
  const wb = X.read(await fil.arrayBuffer(), { type: "array" });
  const navn = wb.SheetNames.find(n => norm(n) === "besetning") || wb.SheetNames[0];
  const rå = X.utils.sheet_to_json(wb.Sheets[navn], { header: 1, raw: true, defval: "" });
  const hi = rå.findIndex((r, i) => i < 15 && r.some(c => hNorm(c) === "idnr") && r.some(c => hNorm(c) === "kjønn"));
  if (hi < 0) throw new Error(`Fant ikke overskriftene «ID-nr» og «Kjønn» i arket «${navn}». Bruk malen fra Flokkboka.`);
  const map = {};
  rå[hi].forEach((h, i) => { map[hNorm(h)] = i; });
  imp.rader = rå.slice(hi + 1).map((r, i) => ({ rad: hi + i + 2, celler: r })).filter(x => x.celler.some(c => String(c).trim() !== ""));
  imp.kolMap = map; imp.filnavn = fil.name; imp.ark = navn;
  valider();
}
function valider() {
  const imp = S.imp, map = imp.kolMap;
  const celle = (r, art, k) => {
    const kol = malKolonner(art).find(x => x.k === k) || (k === "art" ? { h: "Dyreslag" } : null);
    if (!kol) return "";
    const i = map[hNorm(kol.h)];
    return i === undefined ? "" : r.celler[i];
  };
  const sett = new Map();
  const ut = imp.rader.map(r => {
    const feil = [], vars = [];
    const art = tolkArt(celle(r, imp.art, "art"), imp.art);
    if (!art) return { r, feil: ["Ukjent dyreslag «" + celle(r, imp.art, "art") + "»"], vars, handling: "feil" };
    const A = ARTER[art], v = k => String(celle(r, art, k) ?? "").trim();
    const idnr = v("idnr").replace(/\s+/g, " ");
    if (!idnr) feil.push("ID-nr mangler");
    const kj = tolkKjønn(v("kjonn"), art);
    if (kj === null) feil.push("Kjønn mangler");
    else if (kj === undefined) feil.push(`Ukjent kjønn «${v("kjonn")}» (bruk ${A.hunn} eller ${A.hann})`);
    const fodt = excelDato(celle(r, art, "fodt"));
    if (fodt === undefined) feil.push(`Ugyldig fødselsdato «${v("fodt")}»`);
    else if (fodt && fodt > today()) feil.push("Fødselsdato er fram i tid");
    const sd = excelDato(celle(r, art, "status_dato"));
    if (sd === undefined) feil.push(`Ugyldig statusdato «${v("status_dato")}»`);
    let status = v("status");
    if (status) { const s = A.statuser.find(x => norm(x) === norm(status)); if (!s) feil.push(`Ukjent status «${status}»`); else status = s; }
    const ekstra = {};
    if (kj && kj.vallak) ekstra.vallak = "Ja";
    A.ekstra.forEach(e => {
      const val = v("x:" + e.k); if (!val) return;
      if (e.opts) { const o = e.opts.find(x => x && norm(x) === norm(val)); if (o) ekstra[e.k] = o; else vars.push(`${e.l}: «${val}» er ikke gyldig og hoppes over`); }
      else if (e.type === "number") { const n = parseFloat(val.replace(",", ".")); if (isFinite(n)) ekstra[e.k] = String(n); else vars.push(`${e.l}: «${val}» er ikke et tall`); }
      else ekstra[e.k] = val;
    });
    const nøkkel = art + "|" + normId(idnr);
    if (idnr && sett.has(nøkkel)) feil.push(`ID-nr ${idnr} står også i rad ${sett.get(nøkkel)}`);
    else if (idnr) sett.set(nøkkel, r.rad);
    const eks = idnr ? S.dyr.find(d => d.eier_id === imp.eier && d.art === art && normId(d.idnr) === normId(idnr)) : null;
    const data = { art, idnr, kjonn: kj && kj.kjonn, navn: v("navn"), fodt, rase: v("rase"), farge: v("farge"), status, status_dato: sd, merknad: v("merknad"), ekstra, mor: v("mor"), far: v("far") };
    const handling = feil.length ? "feil" : eks ? (imp.oppdater ? "oppdater" : "hopp") : "ny";
    return { r, art, data, eks, feil, vars, handling };
  });
  // Foreldre: finn i filen først, så i Flokkboka (samme art).
  const iFil = new Map(ut.filter(x => x.handling !== "feil").map(x => [x.art + "|" + normId(x.data.idnr), x]));
  ut.forEach(x => {
    if (x.handling === "feil" || x.handling === "hopp") return;
    x.foreldre = {};
    [["mor", "hunn", "Mor"], ["far", "hann", "Far"]].forEach(([k, kj, L]) => {
      const id = x.data[k]; if (!id) return;
      if (normId(id) === normId(x.data.idnr)) { x.vars.push(`${L} kan ikke være individet selv`); return; }
      const f = iFil.get(x.art + "|" + normId(id));
      if (f) { if (f.data.kjonn !== kj) x.vars.push(`${L} ${id} har feil kjønn og kobles ikke`); else x.foreldre[k] = { fil: f }; return; }
      const kand = S.dyr.filter(d => d.art === x.art && normId(d.idnr) === normId(id));
      const e = kand.find(d => d.eier_id === imp.eier) || kand[0];
      if (!e) x.vars.push(`${L} ${id} finnes ikke og kobles ikke`);
      else if (e.kjonn !== kj) x.vars.push(`${L} ${id} har feil kjønn og kobles ikke`);
      else x.foreldre[k] = { id: e.id };
    });
  });
  imp.res = ut; imp.resultat = null;
}
async function kjørImport(btn) {
  const imp = S.imp, rader = imp.res.filter(x => x.handling === "ny" || x.handling === "oppdater");
  if (!rader.length) return;
  vent(btn, true); imp.kjører = true; render();
  const nyttRad = x => {
    const e = x.eks, d = x.data, behold = (ny, gammel) => (ny === "" || ny == null) ? (gammel ?? null) : ny;
    x.id = e ? e.id : uuid();
    return {
      id: x.id, eier_id: e ? e.eier_id : imp.eier, art: x.art, idnr: d.idnr, kjonn: d.kjonn,
      navn: behold(d.navn, e && e.navn), fodt: behold(d.fodt, e && e.fodt), rase: behold(d.rase, e && e.rase), farge: behold(d.farge, e && e.farge),
      status: behold(d.status, (e && e.status) || "Aktiv"), status_dato: behold(d.status_dato, e && e.status_dato), merknad: behold(d.merknad, e && e.merknad),
      ekstra: { ...((e && e.ekstra) || {}), ...d.ekstra }, mor_id: e ? e.mor_id || null : null, far_id: e ? e.far_id || null : null
    };
  };
  const payload = rader.map(nyttRad);
  let ok = 0, koblet = 0;
  try {
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await S.sb.from("dyr").upsert(payload.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(`Rad ${rader[i].r.rad}–${rader[Math.min(i + 199, rader.length - 1)].r.rad}: ${feil(error)}`);
      ok = Math.min(i + 200, payload.length);
    }
    const fase2 = [];
    rader.forEach((x, i) => {
      const p = payload[i], f = x.foreldre || {};
      const mor = f.mor ? (f.mor.fil ? f.mor.fil.id : f.mor.id) : p.mor_id, far = f.far ? (f.far.fil ? f.far.fil.id : f.far.id) : p.far_id;
      if (mor !== p.mor_id || far !== p.far_id) fase2.push({ ...p, mor_id: mor || null, far_id: far || null });
    });
    for (let i = 0; i < fase2.length; i += 200) {
      const { error } = await S.sb.from("dyr").upsert(fase2.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error("Individene er lagret, men noen foreldrekoblinger feilet: " + feil(error));
      koblet = Math.min(i + 200, fase2.length);
    }
    imp.resultat = { ok: true, nye: rader.filter(x => x.handling === "ny").length, oppdatert: rader.filter(x => x.handling === "oppdater").length, koblet };
    toast(`Import fullført: ${ok} individer`);
  } catch (e) { imp.resultat = { ok: false, tekst: feil(e), lagret: ok, koblet }; }
  imp.kjører = false;
  await lastData();
}
function importView() {
  const ark = skrivbareArkiv();
  if (!S.imp) S.imp = { eier: S.f.arkiv !== "alle" && ark.includes(S.f.arkiv) ? S.f.arkiv : S.me.id, art: S.f.art !== "alle" ? S.f.art : "sau", oppdater: true, medDyr: false, res: null };
  const imp = S.imp, A = ARTER[imp.art], kol = malKolonner(imp.art);
  const ant = imp.res ? ["ny", "oppdater", "hopp", "feil"].map(h => imp.res.filter(x => x.handling === h).length) : null;
  const handTekst = { ny: "Ny", oppdater: "Oppdateres", hopp: "Hoppes over", feil: "Feil" };
  return `<button class="btn sm back" data-act="nav" data-v="arkiv">← Arkiv</button>
  <div class="grid2" style="margin-top:8px">
  <div class="card"><div class="eyebrow">Steg 1</div><h2 style="font-size:1.4rem;margin-bottom:6px">Last ned Excel-mal</h2>
    <p class="muted" style="margin:0 0 12px;font-size:.9rem">Malen har arket «Besetning» for dataene, «Veiledning» som forklarer hver kolonne, og «Gyldige verdier» med kjønn, status og raser.</p>
    <div class="filters">
      ${ark.length > 1 ? `<label class="f">Arkiv${velg("imp-eier", ark.map(id => [id, arkivNavn(id)]), imp.eier, "Arkiv")}</label>` : ""}
      <div class="row">${Object.entries(ARTER).map(([k, a]) => `<button class="chip" data-act="impart" data-v="${k}" aria-pressed="${imp.art === k}">${esc(a.navn)}</button>`).join("")}</div>
      ${sjekk("imp-meddyr", imp.medDyr, `Fyll malen med ${A.navn.toLowerCase()} som allerede er i arkivet (${S.dyr.filter(d => d.eier_id === imp.eier && d.art === imp.art).length})`)}
      <div><button class="btn pri" data-act="malned">Last ned mal for ${esc(A.navn.toLowerCase())} (.xlsx)</button></div>
    </div>
    <details class="kolinfo"><summary>Kolonner i malen</summary><div class="tw"><table class="t"><thead><tr><th>Kolonne</th><th>Påkrevd</th><th>Gyldige verdier</th></tr></thead><tbody>
      ${kol.map(k => `<tr><td>${esc(k.h.replace(" *", ""))}</td><td>${k.maa ? "<b>Må</b>" : "Kan"}</td><td>${esc(k.fmt)}</td></tr>`).join("")}</tbody></table></div></details>
  </div>
  <div class="card"><div class="eyebrow">Steg 2</div><h2 style="font-size:1.4rem;margin-bottom:6px">Importer utfylt mal</h2>
    <p class="muted" style="margin:0 0 12px;font-size:.9rem">Dyrene legges i <b>${esc(arkivNavn(imp.eier))}</b>. Rader uten dyreslag tolkes som ${esc(A.navn.toLowerCase())}.</p>
    <div class="filters">
      <label class="f">Excel-fil (.xlsx, .xls eller .csv)<input type="file" id="imp-fil" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
      ${sjekk("imp-oppdater", imp.oppdater, "Oppdater individer som allerede finnes (samme ID-nr)")}
    </div>
    ${imp.resultat ? (imp.resultat.ok ? `<div class="okbox"><b>Import fullført.</b> ${imp.resultat.nye} nye og ${imp.resultat.oppdatert} oppdaterte individer. ${imp.resultat.koblet} foreldrekoblinger satt.</div>`
      : `<div class="warn"><b>Importen stoppet.</b> ${esc(imp.resultat.tekst)} ${imp.resultat.lagret} individer ble lagret før feilen.</div>`) : ""}
  </div></div>
  ${imp.res ? `<div class="card" style="margin-top:16px"><div class="eyebrow">Steg 3 · ${esc(imp.filnavn)} · ark «${esc(imp.ark)}»</div><h2 style="font-size:1.4rem;margin-bottom:10px">Kontroller før import</h2>
    <div class="stats"><div class="stat"><b>${ant[0]}</b><span>Nye</span></div><div class="stat"><b>${ant[1]}</b><span>Oppdateres</span></div><div class="stat"><b>${ant[2]}</b><span>Hoppes over</span></div><div class="stat ${ant[3] ? "bad" : ""}"><b>${ant[3]}</b><span>Med feil</span></div></div>
    <div class="row" style="display:flex;flex-wrap:wrap;gap:8px 12px;margin-bottom:10px"><button class="btn pri" data-act="importer" ${ant[0] + ant[1] && !imp.kjører ? "" : "disabled"}>${imp.kjører ? "Importerer …" : `Importer ${ant[0] + ant[1]} individer`}</button>${ant[3] ? `<span class="muted" style="font-size:.88rem;align-self:center">Rader med feil importeres ikke. Rett dem i Excel og last opp på nytt.</span>` : ""}</div>
    <div class="tw"><table class="t imptab"><thead><tr><th>Rad</th><th>ID-nr</th><th>Navn</th><th>Kjønn</th><th>Født</th><th>Mor</th><th>Far</th><th>Handling</th><th>Merknader</th></tr></thead><tbody>
    ${imp.res.map(x => `<tr class="h-${x.handling}"><td class="mono">${x.r.rad}</td><td class="mono">${esc(x.data ? x.data.idnr : "")}</td><td>${esc(x.data ? x.data.navn : "")}</td><td>${esc(x.data && x.data.kjonn ? ARTER[x.art][x.data.kjonn] : "")}</td><td class="mono">${esc(x.data && x.data.fodt || "")}</td><td>${esc(x.data ? x.data.mor : "")}</td><td>${esc(x.data ? x.data.far : "")}</td>
      <td><span class="pill hand-${x.handling}">${handTekst[x.handling]}</span></td><td class="msgs">${[...x.feil.map(m => `<span class="err">${esc(m)}</span>`), ...x.vars.map(m => `<span class="muted">${esc(m)}</span>`)].join("<br>")}</td></tr>`).join("")}
    </tbody></table></div></div>` : ""}`;
}

/* ---------- Deling og konto ---------- */
function deling() {
  const mine = S.delinger.filter(x => x.eier_id === S.me.id), tilMeg = S.delinger.filter(x => x.mottaker_id === S.me.id);
  const tilgSel = x => `<select class="inline" data-act-change="endretilgang" data-id="${x.id}" aria-label="Tilgang">${[["les", "Kan lese"], ["skriv", "Kan registrere og endre"]].map(([v, l]) => `<option value="${v}" ${x.tilgang === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  return `<button class="btn sm back" data-act="nav" data-v="arkiv">← Arkiv</button>
  <div class="grid2" style="margin-top:8px">
    <div class="card"><div class="eyebrow">Konto</div><h2 style="font-size:1.4rem;margin-bottom:12px">Min profil</h2>
      <form id="pform" class="filters">
        <label class="f">Navn<input id="p-navn" type="text" value="${esc(S.me.navn)}" autocomplete="name"></label>
        <label class="f">E-post<input type="text" value="${esc(S.me.epost)}" disabled></label>
        <div class="inrow"><span class="muted" style="font-size:.88rem">Rolle: <span class="role">${S.me.rolle === "admin" ? "Administrator" : "Bruker"}</span></span><button class="btn sm pri" type="submit">Lagre navn</button></div>
      </form></div>
    <div class="card"><div class="eyebrow">Deling</div><h2 style="font-size:1.4rem;margin-bottom:6px">Del mitt arkiv</h2>
      <p class="muted" style="margin:0 0 12px;font-size:.9rem">Personen må ha registrert seg i Flokkboka først. Med skrivetilgang kan de registrere dyr og hendelser i arkivet ditt, men ikke slette dyr.</p>
      <form id="dform" class="inrow">
        <label class="f">E-post<input id="d-epost" type="email" required placeholder="nabo@eksempel.no"></label>
        <label class="f">Tilgang<select id="d-tilgang"><option value="les">Kan lese</option><option value="skriv">Kan registrere og endre</option></select></label>
        <button class="btn pri" type="submit">Del</button></form></div>
  </div>
  <div class="card" style="margin-top:16px"><h3 style="font-size:1.1rem;margin-bottom:8px">Delt av meg (${mine.length})</h3>
    ${mine.length ? `<div class="tw"><table class="t"><thead><tr><th>Person</th><th>Tilgang</th><th>Siden</th><th></th></tr></thead><tbody>${mine.map(x => `<tr><td>${esc(pNavn(x.mottaker_id))}<br><span class="muted mono" style="font-size:.75rem">${esc((S.profiler[x.mottaker_id] || {}).epost || "")}</span></td><td>${tilgSel(x)}</td><td>${fmtD(x.opprettet)}</td><td style="text-align:right">${slettKnapp("s:" + x.id, "Fjern", "Bekreft fjern", `data-act="fjerndeling" data-id="${x.id}"`)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Du har ikke delt arkivet ditt med noen.</p>`}</div>
  <div class="card" style="margin-top:16px"><h3 style="font-size:1.1rem;margin-bottom:8px">Delt med meg (${tilMeg.length})</h3>
    ${tilMeg.length ? `<div class="tw"><table class="t"><thead><tr><th>Arkiv</th><th>Tilgang</th><th>Individer</th><th></th></tr></thead><tbody>${tilMeg.map(x => `<tr><td>${esc(pNavn(x.eier_id))}</td><td>${x.tilgang === "skriv" ? "Kan registrere og endre" : "Kan lese"}</td><td>${S.dyr.filter(d => d.eier_id === x.eier_id).length}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm" data-act="visarkiv" data-id="${x.eier_id}">Vis arkiv</button> ${slettKnapp("s:" + x.id, "Forlat", "Bekreft forlat", `data-act="fjerndeling" data-id="${x.id}"`)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen har delt et arkiv med deg ennå.</p>`}</div>`;
}

/* ---------- Administrasjon ---------- */
function admin() {
  if (!erAdmin()) return `<div class="card empty"><h3>Bare for administrator</h3></div>`;
  const brukere = Object.values(S.profiler).sort((a, b) => (a.navn || a.epost).localeCompare(b.navn || b.epost, "nb"));
  const antall = id => S.dyr.filter(d => d.eier_id === id).length;
  return `<button class="btn sm back" data-act="nav" data-v="arkiv">← Arkiv</button>
  <div class="card" style="margin-top:8px"><div class="eyebrow">Administrasjon</div><h2 style="font-size:1.5rem;margin-bottom:12px">Brukere og tilgang</h2>
    <div class="stats">
      <div class="stat"><b>${brukere.length}</b><span>Brukere</span></div>
      <div class="stat"><b>${brukere.filter(b => b.rolle === "admin").length}</b><span>Admin</span></div>
      <div class="stat"><b>${S.dyr.length}</b><span>Individer</span></div>
      <div class="stat"><b>${S.hend.length}</b><span>Hendelser</span></div></div>
    <div class="tw"><table class="t"><thead><tr><th>Bruker</th><th>Rolle</th><th>Status</th><th>Individer</th><th>Registrert</th><th></th></tr></thead><tbody>
    ${brukere.map(b => `<tr><td>${esc(b.navn || "–")}${b.id === S.me.id ? ` <span class="pill">deg</span>` : ""}<br><span class="muted mono" style="font-size:.75rem">${esc(b.epost)}</span></td>
      <td><select class="inline" data-act-change="rolle" data-id="${b.id}" aria-label="Rolle"><option value="bruker" ${b.rolle === "bruker" ? "selected" : ""}>Bruker</option><option value="admin" ${b.rolle === "admin" ? "selected" : ""}>Administrator</option></select></td>
      <td><button class="btn sm ${b.aktiv ? "" : "danger"}" data-act="aktiv" data-id="${b.id}" ${b.id === S.me.id ? "disabled" : ""}>${b.aktiv ? "Aktiv – steng" : "Stengt – åpne"}</button></td>
      <td>${antall(b.id)}</td><td>${fmtD(b.opprettet)}</td>
      <td style="text-align:right"><button class="btn sm" data-act="visarkiv" data-id="${b.id}" ${antall(b.id) ? "" : "disabled"}>Vis arkiv</button></td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="font-size:.85rem;margin:10px 0 0">Nye brukere registrerer seg selv og får rollen Bruker. Stengte brukere kan logge inn, men ser ingen data. Sletting av konto gjøres i Supabase under Authentication → Users.</p></div>
  <div class="card" style="margin-top:16px"><h3 style="font-size:1.1rem;margin-bottom:8px">Alle delinger (${S.delinger.length})</h3>
    ${S.delinger.length ? `<div class="tw"><table class="t"><thead><tr><th>Arkiv</th><th>Delt med</th><th>Tilgang</th><th>Siden</th><th></th></tr></thead><tbody>${S.delinger.map(x => `<tr><td>${esc(pNavn(x.eier_id))}</td><td>${esc(pNavn(x.mottaker_id))}</td><td>${x.tilgang === "skriv" ? "Skrive" : "Lese"}</td><td>${fmtD(x.opprettet)}</td><td style="text-align:right">${slettKnapp("s:" + x.id, "Fjern", "Bekreft fjern", `data-act="fjerndeling" data-id="${x.id}"`)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen delinger.</p>`}</div>`;
}

/* ---------- Render ---------- */
const FULLBREDDE = ["deling", "admin", "felles", "import"];
function render() {
  if (!S.me) return;
  $("#top").hidden = false;
  const navs = [["arkiv", "Arkiv"], ["rapporter", "Rapporter"], ["deling", "Deling"], ...(erAdmin() ? [["admin", "Admin"]] : [])];
  const aktivNav = ["arkiv", "dyr", "skjema", "felles", "import"].includes(S.view) ? "arkiv" : S.view;
  $("#nav").innerHTML = navs.map(([v, l]) => `<button data-act="nav" data-v="${v}" aria-pressed="${aktivNav === v}">${l}</button>`).join("");
  $("#brand-sub").innerHTML = `${esc(S.me.navn || S.me.epost)}${erAdmin() ? ` <span class="role">Admin</span>` : ""} · <button class="linkbtn" data-act="loggut">Logg ut</button>`;
  const main = S.view === "skjema" && S.edit ? skjema() : S.view === "rapporter" ? rapporter() : S.view === "deling" ? deling() : S.view === "admin" ? admin()
    : S.view === "felles" ? fellesView() : S.view === "import" ? importView() : detalj();
  // Bevar fokus, markør og rulleposisjon slik at filtre og søk oppdateres uten avbrudd.
  const ae = document.activeElement, fokus = ae && ae.id;
  let selS = null, selE = null; try { if (ae && typeof ae.selectionStart === "number") { selS = ae.selectionStart; selE = ae.selectionEnd; } } catch (e) {}
  const lp = $(".listpane"), lpTop = lp ? lp.scrollTop : 0, sl = $(".selist"), slTop = sl ? sl.scrollTop : 0;
  $("#app").innerHTML = FULLBREDDE.includes(S.view) ? `<div class="fullview">${main}</div>` :
    `<div class="layout ${S.view === "arkiv" ? "" : "detail"}"><aside class="panel listpane">${listPane()}</aside><main class="panel mainpane">${main}</main></div>`;
  const lp2 = $(".listpane"); if (lp2) lp2.scrollTop = lpTop;
  const sl2 = $(".selist"); if (sl2) sl2.scrollTop = slTop;
  if (fokus) { const el = document.getElementById(fokus); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); try { if (selS !== null) el.setSelectionRange(selS, selE); } catch (e) {} } }
}

/* ---------- Handlinger ---------- */
function nyttIndivid(pre = {}) {
  const eier = S.f.arkiv !== "alle" && kanSkrive(S.f.arkiv) ? S.f.arkiv : S.me.id;
  S.edit = { art: S.f.art !== "alle" ? S.f.art : "sau", kjonn: "hunn", status: "Aktiv", eier_id: eier, ekstra: {}, ...pre };
  S.view = "skjema"; render(); window.scrollTo(0, 0);
}
async function kjør(fn, okTekst) {
  try { await fn(); if (okTekst) toast(okTekst); await lastData(); }
  catch (e) { toast(feil(e)); render(); }
}
const db = res => { if (res.error) throw res.error; return res; };
function settFilter(k, v) { S.f[k] = v; if (k === "art") S.f.rase = "alle"; husk(); render(); }

document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
  const a = b.dataset.act, id = b.dataset.id;
  const tidligereBekreft = S.bekreft;
  if (!["slett", "delhend", "fjerndeling"].includes(a)) S.bekreft = null;
  const toTrinn = nøkkel => { if (tidligereBekreft === nøkkel) { S.bekreft = null; return true; } S.bekreft = nøkkel; render(); return false; };

  switch (a) {
    case "authmode": S.auth = { mode: b.dataset.v, err: "", msg: "" }; renderAuth(); break;
    case "loggut": await S.sb.auth.signOut(); break;
    case "nav":
      S.view = b.dataset.v === "arkiv" && window.innerWidth >= 900 && S.sel ? "dyr" : b.dataset.v; S.hf = null;
      if (S.view === "felles" && (!S.fo || !skrivbareArkiv().includes(S.fo.eier))) foInit();
      if (S.view === "rapporter" && S.f.art !== "alle") S.rap.art = S.f.art;
      render(); window.scrollTo(0, 0); break;
    case "ny": nyttIndivid(); break;
    case "vis": S.sel = id; S.view = "dyr"; S.hf = null; render(); if (window.innerWidth < 900) window.scrollTo(0, 0); break;
    case "visarkiv": S.f.arkiv = id; S.f.status = "alle"; husk(); S.view = "arkiv"; render(); break;
    case "filt": settFilter(b.dataset.k, b.dataset.v); break;
    case "nullstill": S.f = { ...FILTER0, sort: S.f.sort }; husk(); render(); break;
    case "togglerelbilde": S.opt.bildeRelasjon = !S.opt.bildeRelasjon; husk(); render(); break;
    case "rediger": S.edit = JSON.parse(JSON.stringify(byId(id))); S.view = "skjema"; render(); break;
    case "nyavkom": { const p = byId(id); nyttIndivid({ art: p.art, eier_id: kanSkrive(p.eier_id) ? p.eier_id : S.me.id, [p.kjonn === "hann" ? "far_id" : "mor_id"]: p.id, fodt: today(), rase: p.rase }); break; }
    case "setart": Object.assign(S.edit, lesSkjema(), { art: b.dataset.v, mor_id: null, far_id: null, ekstra: {} }); render(); break;
    case "avbryt": S.view = S.edit && S.edit.id ? "dyr" : (S.sel ? "dyr" : "arkiv"); S.edit = null; render(); break;
    case "nyhend": { const d = byId(id); S.hf = { dyr_id: id, type: A_(d).hendelser[0].n, dato: today() }; render(); break; }
    case "avbrythend": S.hf = null; render(); break;
    case "delhend": if (toTrinn("h:" + id)) kjør(async () => db(await S.sb.from("hendelser").delete().eq("id", id)), "Hendelse slettet"); break;
    case "slett": if (toTrinn("d:" + id)) { const d = byId(id); kjør(async () => {
        db(await S.sb.from("dyr").delete().eq("id", id));
        if (d && d.bilde_path) await S.sb.storage.from(BUCKET).remove([d.bilde_path]);
        S.sel = null; S.view = "arkiv"; }, "Individ slettet"); } break;
    case "fjerndeling": if (toTrinn("s:" + id)) kjør(async () => db(await S.sb.from("delinger").delete().eq("id", id)), "Deling fjernet"); break;
    case "aktiv": { const p = S.profiler[id]; kjør(async () => db(await S.sb.from("profiles").update({ aktiv: !p.aktiv }).eq("id", id)), p.aktiv ? "Bruker stengt" : "Bruker åpnet"); break; }
    case "rapport": S.rap.id = id; S.rap.type = b.dataset.t; S.view = "rapporter"; render(); window.scrollTo(0, 0); break;
    case "raptype": S.rap.type = b.dataset.v; render(); break;
    case "rapperiode": settPeriode(b.dataset.v); render(); break;
    case "pdf": pdf(b); break;
    case "print": window.print(); break;
    case "csvrap": csvRapport(); break;
    case "csvalle": csvAlle(); break;
    case "csvhend": lagreCsv("flokkboka_hendelser_" + today() + ".csv", csvHendRader([...S.hend].sort((x, y) => (x.dato || "").localeCompare(y.dato || "")))); break;
    case "fo": S.fo[b.dataset.k] = b.dataset.v; if (b.dataset.k === "art") { S.fo.valgt = new Set(); S.fo.type = "Observasjon"; S.fo.verdi = ""; } render(); break;
    case "fo-alle": foSynlige().forEach(d => S.fo.valgt.add(d.id)); render(); break;
    case "fo-ingen": S.fo.valgt = new Set(); render(); break;
    case "impart": S.imp.art = b.dataset.v; if (S.imp.kolMap) valider(); render(); break;
    case "malned": lastNedMal(S.imp.art, S.imp.eier, S.imp.medDyr); break;
    case "importer": kjørImport(b); break;
  }
});
document.addEventListener("input", ev => {
  const t = ev.target;
  if (t.id === "q") { S.f.q = t.value; render(); }
  else if (t.id === "fo-q") { S.fo.q = t.value; render(); }
  else if (t.id === "fo-verdi") S.fo.verdi = t.value;
  else if (t.id === "fo-tekst") S.fo.tekst = t.value;
  else if (t.id === "fo-dato") S.fo.dato = t.value;
  else if (t.id === "rap-fra" || t.id === "rap-til") { if (t.value) { S.rap[t.id === "rap-fra" ? "fra" : "til"] = t.value; render(); } }
});
document.addEventListener("change", async ev => {
  const t = ev.target, ac = t.dataset.actChange;
  const filterFelt = { fstatus: "status", farkiv: "arkiv", frase: "rase", faar: "aar", fsort: "sort" };
  if (filterFelt[t.id]) settFilter(filterFelt[t.id], t.value);
  else if (t.id === "rap-id") { S.rap.id = t.value; render(); }
  else if (t.id === "rap-art") { S.rap.art = t.value; render(); }
  else if (t.id === "rap-arkiv") { S.rap.arkiv = t.value; render(); }
  else if (t.id === "opt-bilde") { S.opt.bildeRapport = t.checked; husk(); render(); }
  else if (t.id === "opt-relbilde") { S.opt.bildeRelasjon = t.checked; husk(); render(); }
  else if (t.id === "h-type") { S.hf.type = t.value; S.hf.dato = $("#h-dato").value; S.hf.tekst = $("#h-tekst").value; render(); }
  else if (t.id === "fo-eier") { S.fo.eier = t.value; S.fo.valgt = new Set(); render(); }
  else if (t.id === "fo-type") { S.fo.type = t.value; S.fo.verdi = ""; render(); }
  else if (t.dataset.foId) { if (t.checked) S.fo.valgt.add(t.dataset.foId); else S.fo.valgt.delete(t.dataset.foId); render(); }
  else if (t.id === "imp-eier") { S.imp.eier = t.value; if (S.imp.kolMap) valider(); render(); }
  else if (t.id === "imp-meddyr") { S.imp.medDyr = t.checked; render(); }
  else if (t.id === "imp-oppdater") { S.imp.oppdater = t.checked; if (S.imp.kolMap) valider(); render(); }
  else if (t.id === "imp-fil" && t.files[0]) {
    if (!window.XLSX) { toast("Excel-biblioteket ble ikke lastet. Sjekk nettforbindelsen."); return; }
    try { await lesFil(t.files[0]); } catch (e) { S.imp.res = null; S.imp.kolMap = null; toast(feil(e)); }
    render();
  }
  else if (t.id === "e-bilde" && t.files[0]) {
    if (t.files[0].size > 10 * 1024 * 1024) { toast("Bildet er større enn 10 MB"); t.value = ""; return; }
    Object.assign(S.edit, lesSkjema(), { _fil: t.files[0] }); render();
  }
  else if (ac === "endretilgang") kjør(async () => db(await S.sb.from("delinger").update({ tilgang: t.value }).eq("id", t.dataset.id)), "Tilgang endret");
  else if (ac === "rolle") kjør(async () => db(await S.sb.from("profiles").update({ rolle: t.value }).eq("id", t.dataset.id)), "Rolle endret");
});
document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const f = ev.target, btn = f.querySelector("[type=submit]");
  if (f.id === "authform") return authSubmit(btn);
  if (f.id === "eform") return lagreDyr(btn);
  if (f.id === "foform") return lagreFelles(btn);
  if (f.id === "hform") {
    const h = { dyr_id: S.hf.dyr_id, type: $("#h-type").value, dato: $("#h-dato").value, verdi: $("#h-verdi") ? $("#h-verdi").value.trim() || null : null, tekst: $("#h-tekst").value.trim() || null };
    vent(btn, true);
    return kjør(async () => { db(await S.sb.from("hendelser").insert(h)); S.hf = null; }, "Hendelse lagret");
  }
  if (f.id === "pform") return kjør(async () => db(await S.sb.from("profiles").update({ navn: $("#p-navn").value.trim() }).eq("id", S.me.id)), "Navn lagret");
  if (f.id === "dform") {
    const epost = $("#d-epost").value.trim(), tilg = $("#d-tilgang").value;
    vent(btn, true);
    try {
      const { data, error } = await S.sb.rpc("finn_bruker", { p_epost: epost });
      if (error) throw error;
      const p = data && data[0];
      if (!p) throw new Error("Fant ingen aktiv bruker med e-posten " + epost + ". Be personen opprette konto først.");
      if (p.id === S.me.id) throw new Error("Du kan ikke dele arkivet med deg selv.");
      const r = await S.sb.from("delinger").insert({ eier_id: S.me.id, mottaker_id: p.id, tilgang: tilg });
      if (r.error) throw (r.error.code === "23505" ? new Error("Arkivet er allerede delt med " + (p.navn || epost) + ". Endre tilgangen i listen under.") : r.error);
      toast("Arkivet er delt med " + (p.navn || epost));
      await lastData();
    } catch (e) { toast(feil(e)); vent(btn, false); }
  }
});

init();
})();
