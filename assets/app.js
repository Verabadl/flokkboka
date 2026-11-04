/* Flokkboka – web-app mot Supabase.
   Avhenger av: supabase-js (global "supabase"), jsPDF (global "jspdf"), config.js og arter.js. */
(() => {
"use strict";
const ARTER = window.ARTER;
const CFG = window.FLOKKBOKA_CONFIG || {};
const BUCKET = "dyrebilder";
const BASE_URL = location.origin + location.pathname;

/* ---------- Tilstand ---------- */
const S = {
  sb: null, session: null, me: null,
  dyr: [], hend: [], profiler: {}, delinger: [], bilder: {}, lastet: 0, laster: false,
  view: "arkiv", sel: null, edit: null, hf: null, bekreft: null,
  f: { q: "", art: "alle", kjonn: "alle", status: "Aktiv", arkiv: "alle" },
  rap: { id: "", type: "individ" },
  auth: { mode: "inn", err: "", msg: "" }
};

/* ---------- Små hjelpere ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtD = d => d ? new Date(d.slice(0, 10) + "T12:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" }) : "–";
const byId = id => S.dyr.find(d => d.id === id);
const A_ = d => ARTER[d && d.art] || ARTER.sau;
const ex = (d, k) => (d && d.ekstra && d.ekstra[k]) || "";
function alder(f) {
  if (!f) return "–";
  const a = new Date(f), n = new Date();
  let m = (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth();
  if (n.getDate() < a.getDate()) m--;
  if (m < 0) return "–";
  const y = Math.floor(m / 12);
  return y ? `${y} år${m % 12 ? " " + (m % 12) + " mnd" : ""}` : `${m} mnd`;
}
const erUng = d => d.fodt && new Date(d.fodt).getFullYear() === new Date().getFullYear();
const kjL = d => d ? A_(d)[d.kjonn === "hann" ? "hann" : "hunn"] : "";
const label = d => d ? (d.navn || d.idnr || "Uten navn") : "";
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3200); }
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
  if (erAdmin()) return Object.values(S.profiler).filter(p => p.aktiv).map(p => p.id);
  return [S.me.id, ...S.delinger.filter(x => x.mottaker_id === S.me.id && x.tilgang === "skriv").map(x => x.eier_id)];
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
    if (ev === "SIGNED_OUT") { Object.assign(S, { session: null, me: null, dyr: [], hend: [], profiler: {}, delinger: [], bilder: {}, view: "arkiv", sel: null }); renderAuth(); return; }
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
  if (!mangler.length) return;
  const { data } = await S.sb.storage.from(BUCKET).createSignedUrls(mangler, 60 * 60 * 12);
  (data || []).forEach(x => { if (x.signedUrl) S.bilder[x.path] = x.signedUrl; });
}
const bildeUrl = d => d && d.bilde_path ? S.bilder[d.bilde_path] || "" : "";

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
  $("#app").innerHTML = `<div class="auth"><div class="brandbig"><img src="assets/ikon.svg" width="46" height="46" alt=""><div><h1>Flokkboka</h1><span class="muted">Digitalt arkiv for sau og hund</span></div></div>
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
      if (!data.session) { S.auth = { mode: "inn", err: "", msg: "Konto opprettet. Bekreft e-postadressen via lenken vi sendte, og logg deretter inn." }; }
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
function sisteVekt(id) { const h = hendFor(id).find(h => h.type === "Veiing" && h.verdi); return h ? h.verdi + " kg (" + fmtD(h.dato) + ")" : "–"; }

/* ---------- Byggeklosser ---------- */
function thumb(d) { const u = bildeUrl(d); return u ? `<img class="thumb" src="${esc(u)}" alt="">` : `<div class="thumb">${esc(A_(d).ikon)}</div>`; }
function badges(d) {
  return `${d.idnr ? `<span class="ear">${esc(d.idnr)}</span>` : ""}<span class="sex ${d.kjonn === "hann" ? "hann" : "hunn"}">${esc(kjL(d))}</span>` +
    (erUng(d) ? `<span class="pill lam">${esc(A_(d).ung)}</span>` : "") +
    `<span class="pill ${(d.status || "Aktiv") === "Aktiv" ? "aktiv" : ""}">${esc(d.status || "Aktiv")}</span>`;
}
const chips = (key, opts) => opts.map(([v, l]) => `<button class="chip" data-act="filt" data-k="${key}" data-v="${esc(v)}" aria-pressed="${S.f[key] === v}">${esc(l)}</button>`).join("");
const slettKnapp = (nøkkel, tekst, bekreftTekst, attrs) => `<button class="btn sm danger ${S.bekreft === nøkkel ? "on" : ""}" ${attrs}>${S.bekreft === nøkkel ? esc(bekreftTekst) : esc(tekst)}</button>`;

/* ---------- Arkivliste ---------- */
function arkivValg() {
  const ider = new Set(S.dyr.map(d => d.eier_id));
  S.delinger.filter(x => x.mottaker_id === S.me.id).forEach(x => ider.add(x.eier_id));
  ider.delete(S.me.id);
  return [["alle", "Alle arkiv jeg har tilgang til"], [S.me.id, "Mitt arkiv"], ...[...ider].map(id => [id, pNavn(id) + (tilgang(id) === "les" ? " (lesetilgang)" : "")])];
}
function filtrert() {
  const f = S.f, q = f.q.trim().toLowerCase();
  return S.dyr.filter(d => (f.arkiv === "alle" || d.eier_id === f.arkiv) && (f.art === "alle" || d.art === f.art) && (f.kjonn === "alle" || d.kjonn === f.kjonn) &&
    (f.status === "alle" || (d.status || "Aktiv") === f.status) &&
    (!q || [d.navn, d.idnr, d.rase, d.farge, d.merknad, ...Object.values(d.ekstra || {})].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => (a.art || "").localeCompare(b.art || "") || String(a.idnr || a.navn || "").localeCompare(String(b.idnr || b.navn || ""), "nb", { numeric: true }));
}
function listPane() {
  const utvalg = S.dyr.filter(d => (S.f.arkiv === "alle" || d.eier_id === S.f.arkiv) && (d.status || "Aktiv") === "Aktiv");
  const sau = utvalg.filter(d => d.art === "sau");
  const st = `<div class="stats">
    <div class="stat"><b>${sau.filter(d => d.kjonn === "hunn" && !erUng(d)).length}</b><span>Søyer</span></div>
    <div class="stat"><b>${sau.filter(d => d.kjonn === "hann" && !erUng(d)).length}</b><span>Værer</span></div>
    <div class="stat"><b>${sau.filter(erUng).length}</b><span>Lam i år</span></div>
    <div class="stat"><b>${utvalg.filter(d => d.art === "hund").length}</b><span>Hunder</span></div></div>`;
  const statuser = [...new Set(Object.values(ARTER).flatMap(a => a.statuser))];
  const valg = arkivValg();
  const fl = `<div class="filters">
    ${valg.length > 2 || erAdmin() ? `<select id="farkiv" aria-label="Arkiv">${valg.map(([v, l]) => `<option value="${esc(v)}" ${S.f.arkiv === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
    <input type="search" id="q" placeholder="Søk navn, øremerke, reg.nr, rase …" value="${esc(S.f.q)}" aria-label="Søk i arkivet">
    <div class="row">${chips("art", [["alle", "Alle"], ...Object.entries(ARTER).map(([k, a]) => [k, a.navn])])}
      <span style="width:8px"></span>${chips("kjonn", [["alle", "Begge"], ["hunn", "Hunn"], ["hann", "Hann"]])}</div>
    <select id="fstatus" aria-label="Status">${["alle", ...statuser].map(s => `<option value="${esc(s)}" ${S.f.status === s ? "selected" : ""}>${s === "alle" ? "Alle statuser" : esc(s)}</option>`).join("")}</select></div>`;
  const rows = filtrert();
  let body;
  if (!S.lastet) body = `<div class="empty">Henter arkivet …</div>`;
  else if (!S.dyr.length) body = `<div class="empty"><h3>Arkivet er tomt</h3>Registrer første søye, vær eller hund med <b>+ Nytt individ</b>. Foreldre, avkom og hendelser kobles til etterpå.</div>`;
  else if (!rows.length) body = `<div class="empty">Ingen individer passer filteret.</div>`;
  else body = `<div class="list">${rows.map(d => `<button class="item" data-act="vis" data-id="${d.id}" aria-current="${S.sel === d.id}">
      ${thumb(d)}<div style="min-width:0"><div class="nm">${esc(label(d))}</div><div class="sub">${esc([d.idnr && d.navn ? d.idnr : "", d.rase, alder(d.fodt), d.eier_id !== S.me.id ? arkivNavn(d.eier_id) : ""].filter(Boolean).join(" · "))}</div></div>
      <span class="sex ${d.kjonn === "hann" ? "hann" : "hunn"}">${esc(kjL(d))}</span></button>`).join("")}</div>
      <p class="muted" style="font-size:.8rem;margin:10px 2px 0">${rows.length} av ${S.dyr.length} individer</p>`;
  return st + fl + body;
}

/* ---------- Individkort ---------- */
function relCard(l, d) {
  if (!d) return `<div class="relcard"><div><div class="l">${esc(l)}</div><div class="n muted">Ikke registrert</div></div></div>`;
  return `<button class="relcard has" data-act="vis" data-id="${d.id}">${thumb(d)}<div><div class="l">${esc(l)}</div><div class="n">${esc(label(d))}</div><div class="muted" style="font-size:.78rem">${esc([d.idnr, d.fodt ? d.fodt.slice(0, 4) : ""].filter(Boolean).join(" · "))}</div></div></button>`;
}
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
    <div class="sec"><h3>Foreldre</h3><div class="rel">${relCard(A.morL, mor)}${relCard(A.farL, far)}</div>
      ${ff.length ? `<div class="warn">Innavlsvarsel: mor og far har ${ff.length} felles ane${ff.length > 1 ? "r" : ""} (${ff.map(x => esc(label(byId(x.id)))).join(", ")}). Se relasjonsrapporten.</div>` : ""}</div>
    <div class="sec"><h3>Avkom <span class="muted" style="font-size:.85rem;font-weight:400">${av.length}</span></h3>
      ${av.length ? `<div class="rel">${av.map(x => relCard(`${kjL(x)} · ${x.fodt ? x.fodt.slice(0, 4) : "?"}`, x)).join("")}</div>` : `<p class="muted" style="margin:0">Ingen avkom registrert.</p>`}</div>
    ${so.length ? `<div class="sec"><h3>Søsken <span class="muted" style="font-size:.85rem;font-weight:400">${so.length}</span></h3><div class="rel">${so.map(x => relCard(x.hel ? "Helsøsken" : "Halvsøsken", x.d)).join("")}</div></div>` : ""}
    <div class="sec"><h3>Hendelser og observasjoner <span class="muted" style="font-size:.85rem;font-weight:400">${hs.length}</span></h3>
      ${hendForm}
      ${hs.length ? `<div class="timeline">${hs.map(h => { const def = A.hendelser.find(x => x.n === h.type) || {}; return `<div class="ev ${def.obs ? "obs" : ""}"><div class="h"><span class="d">${esc(h.dato || "")}</span><span class="t">${esc(h.type)}</span>${h.verdi ? `<span class="pill">${esc(def.v || "Verdi")}: ${esc(h.verdi)}</span>` : ""}
        ${h.registrert_av && h.registrert_av !== S.me.id ? `<span class="owner">av ${esc(pNavn(h.registrert_av))}</span>` : ""}
        ${ed ? `<span class="x">${slettKnapp("h:" + h.id, "Slett", "Bekreft slett", `data-act="delhend" data-id="${h.id}"`)}</span>` : ""}</div>${h.tekst ? `<p>${esc(h.tekst)}</p>` : ""}</div>`; }).join("")}</div>`
        : (hendForm ? "" : `<p class="muted" style="margin:0">Ingen hendelser ennå.${ed ? " Registrer veiing, vaksinering, lamming eller en observasjon." : ""}</p>`)}</div>
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
    <label class="f">Rase<input type="text" id="e-rase" list="raser" value="${esc(e.rase || "")}"><datalist id="raser">${A.raser.map(r => `<option value="${esc(r)}">`).join("")}</datalist></label>
    <label class="f">Farge / tegning<input type="text" id="e-farge" value="${esc(e.farge || "")}"></label>
    ${A.ekstra.map(x => `<label class="f">${esc(x.l)}${x.opts ? `<select id="e-x-${x.k}">${x.opts.map(o => `<option ${ex(e, x.k) === o ? "selected" : ""} value="${esc(o)}">${o || "–"}</option>`).join("")}</select>` : `<input type="${x.type === "number" ? "number" : "text"}" step="0.1" id="e-x-${x.k}" value="${esc(ex(e, x.k))}">`}</label>`).join("")}
    <label class="f">Status<select id="e-status">${A.statuser.map(s => `<option ${(e.status || "Aktiv") === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label class="f">Statusdato (solgt/slaktet/død)<input type="date" id="e-statusdato" value="${esc(e.status_dato || "")}"></label>
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
    const id = e.id || crypto.randomUUID();
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

/* ---------- Rapporter ---------- */
function pedCell(a, i, ff) {
  const g = i < 4 ? 1 : i < 8 ? 2 : 3, p = i - 2 ** g, span = 8 / 2 ** g, id = a[i], d = id && byId(id);
  const rolle = ["", "", "Far", "Mor", "Farfar", "Farmor", "Morfar", "Mormor", "Farfars far", "Farfars mor", "Farmors far", "Farmors mor", "Morfars far", "Morfars mor", "Mormors far", "Mormors mor"][i];
  const st = `grid-column:${g};grid-row:${p * span + 1}/span ${span}`;
  if (!d) return `<div class="pc none" style="${st}"><small>${rolle}</small>Ukjent</div>`;
  return `<button class="pc ${d.kjonn === "hann" ? "hann" : "hunn"} ${ff.has(id) ? "common" : ""}" style="${st}" data-act="vis" data-id="${d.id}"><small>${rolle}${d.idnr ? " · " + esc(d.idnr) : ""}</small><b>${esc(label(d))}</b></button>`;
}
function rapportInnhold(d, type) {
  const A = A_(d);
  if (type === "individ") {
    const hs = hendFor(d.id), av = avkom(d.id);
    return `<div class="card"><div class="eyebrow">Individrapport · ${fmtD(today())} · ${esc(arkivNavn(d.eier_id))}</div><h2 style="font-size:1.5rem">${esc(label(d))}</h2><div class="meta">${badges(d)}</div>
      <div class="sec"><dl class="kv">${[["Art", A.navn], [A.idLabel, d.idnr], ["Kjønn", kjL(d)], ["Født", fmtD(d.fodt)], ["Alder", alder(d.fodt)], ["Rase", d.rase], ["Farge", d.farge], ...A.ekstra.map(e => [e.l, ex(d, e.k)]), ["Status", d.status || "Aktiv"], [A.morL, label(byId(d.mor_id))], [A.farL, label(byId(d.far_id))], ["Antall avkom", String(av.length)], ["Siste vekt", sisteVekt(d.id)]].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || "–")}</dd></div>`).join("")}</dl>
      ${d.merknad ? `<p style="margin:0;white-space:pre-wrap">${esc(d.merknad)}</p>` : ""}</div>
      <div class="sec"><h3>Hendelser og observasjoner (${hs.length})</h3>${hs.length ? `<div class="tw"><table class="t"><thead><tr><th>Dato</th><th>Type</th><th>Verdi</th><th>Beskrivelse</th></tr></thead><tbody>${hs.map(h => `<tr><td class="mono">${esc(h.dato)}</td><td>${esc(h.type)}</td><td>${esc(h.verdi || "")}</td><td>${esc(h.tekst || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen registrerte hendelser.</p>`}</div></div>`;
  }
  const a = stamtre(d.id), fl = felles(d), ff = new Set(fl.map(x => x.id)), av = avkom(d.id), so = sosken(d);
  return `<div class="card"><div class="eyebrow">Relasjonsrapport · ${fmtD(today())} · ${esc(arkivNavn(d.eier_id))}</div><h2 style="font-size:1.5rem">${esc(label(d))}</h2><div class="meta">${badges(d)}</div>
    <div class="sec"><h3>Stamtavle, tre generasjoner</h3><div class="pedwrap"><div class="ped">${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(i => pedCell(a, i, ff)).join("")}</div></div>
    ${fl.length ? `<div class="warn"><b>Innavlsvarsel.</b> Felles aner på fars- og morsside: ${fl.map(x => `${esc(label(byId(x.id)))} (gen. ${x.gf} på farsside, ${x.gm} på morsside)`).join("; ")}. Felles aner er markert i stamtavla.</div>` : `<p class="muted" style="margin:0">Ingen felles aner funnet mellom far og mor i registrerte generasjoner.</p>`}</div>
    <div class="sec"><h3>Avkom (${av.length})</h3>${av.length ? `<div class="tw"><table class="t"><thead><tr><th>${esc(A.idLabel)}</th><th>Navn</th><th>Kjønn</th><th>Født</th><th>Andre forelder</th><th>Egne avkom</th><th>Status</th></tr></thead><tbody>${av.map(x => { const o = byId(x.mor_id === d.id ? x.far_id : x.mor_id); return `<tr><td class="mono">${esc(x.idnr || "")}</td><td>${esc(x.navn || "")}</td><td>${esc(kjL(x))}</td><td class="mono">${esc(x.fodt || "")}</td><td>${esc(label(o) || "–")}</td><td>${avkom(x.id).length}</td><td>${esc(x.status || "Aktiv")}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen avkom registrert.</p>`}</div>
    <div class="sec"><h3>Søsken (${so.length})</h3>${so.length ? `<div class="tw"><table class="t"><thead><tr><th>Navn / ID</th><th>Relasjon</th><th>Kjønn</th><th>Født</th></tr></thead><tbody>${so.map(x => `<tr><td>${esc(label(x.d))}${x.d.idnr && x.d.navn ? ` <span class="mono muted">${esc(x.d.idnr)}</span>` : ""}</td><td>${x.hel ? "Helsøsken" : "Halvsøsken"}</td><td>${esc(kjL(x.d))}</td><td class="mono">${esc(x.d.fodt || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Ingen søsken registrert.</p>`}</div></div>`;
}
function rapporter() {
  const valg = [...S.dyr].sort((a, b) => label(a).localeCompare(label(b), "nb", { numeric: true }));
  const d = byId(S.rap.id);
  return `<button class="btn sm back" data-act="nav" data-v="arkiv">← Arkiv</button>
  <div class="card noprint" style="margin-top:8px"><div class="eyebrow">Rapporter</div><h2 style="font-size:1.5rem;margin-bottom:12px">Ta ut rapport</h2>
    <div class="filters"><select id="rap-id" aria-label="Velg individ"><option value="">Velg individ …</option>${valg.map(x => `<option value="${x.id}" ${x.id === S.rap.id ? "selected" : ""}>${esc(label(x))}${x.idnr && x.navn ? " – " + esc(x.idnr) : ""} (${esc(A_(x).navn)}${x.eier_id !== S.me.id ? ", " + esc(arkivNavn(x.eier_id)) : ""})</option>`).join("")}</select>
    <div class="row">${[["individ", "Individrapport"], ["relasjon", "Relasjonsrapport"]].map(([k, l]) => `<button class="chip" data-act="raptype" data-v="${k}" aria-pressed="${S.rap.type === k}">${l}</button>`).join("")}</div>
    <div class="row"><button class="btn sm pri" data-act="pdf" ${d ? "" : "disabled"}>Last ned PDF</button><button class="btn sm" data-act="print" ${d ? "" : "disabled"}>Skriv ut</button><button class="btn sm" data-act="csvind" ${d ? "" : "disabled"}>Last ned CSV</button></div>
    <div class="row"><button class="btn sm" data-act="csvalle">Hele arkivet som CSV</button><button class="btn sm" data-act="csvhend">Alle hendelser som CSV</button></div></div></div>
  <div style="margin-top:12px">${d ? rapportInnhold(d, S.rap.type) : `<div class="card empty"><h3>Ingen rapport valgt</h3>Velg et individ over for å se individrapport med hendelser, eller relasjonsrapport med stamtavle, avkom og søsken.</div>`}</div>`;
}

/* ---------- Eksport ---------- */
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
function csvAlle() {
  const ek = [...new Set(Object.values(ARTER).flatMap(a => a.ekstra.map(e => e.k)))];
  const liste = filtrert();
  lagreCsv("flokkboka_arkiv_" + today() + ".csv", [["id", "arkiv", "art", "idnr", "navn", "kjonn", "fodt", "rase", "farge", "status", "statusdato", "mor_id", "mor", "far_id", "far", "antall_avkom", ...ek, "merknad"],
    ...liste.map(d => [d.id, arkivNavn(d.eier_id), d.art, d.idnr, d.navn, kjL(d), d.fodt, d.rase, d.farge, d.status || "Aktiv", d.status_dato, d.mor_id, label(byId(d.mor_id)), d.far_id, label(byId(d.far_id)), avkom(d.id).length, ...ek.map(k => ex(d, k)), d.merknad])]);
}
const csvHendRader = list => [["dyr_id", "dyr", "idnr", "art", "dato", "type", "verdi", "beskrivelse", "registrert_av"], ...list.map(h => { const d = byId(h.dyr_id) || {}; return [h.dyr_id, label(d), d.idnr, d.art, h.dato, h.type, h.verdi, h.tekst, h.registrert_av ? pNavn(h.registrert_av) : ""]; })];
function csvInd() {
  const d = byId(S.rap.id); if (!d) return;
  if (S.rap.type === "individ") { lagreCsv(filnavn(d) + "_hendelser.csv", csvHendRader(hendFor(d.id))); return; }
  const a = stamtre(d.id), roller = ["", "Individ", "Far", "Mor", "Farfar", "Farmor", "Morfar", "Mormor", "Farfars far", "Farfars mor", "Farmors far", "Farmors mor", "Morfars far", "Morfars mor", "Mormors far", "Mormors mor"];
  const rows = [["relasjon", "id", "idnr", "navn", "kjonn", "fodt"]];
  for (let i = 1; i < 16; i++) { const x = byId(a[i]); if (x) rows.push([roller[i], x.id, x.idnr, x.navn, kjL(x), x.fodt]); }
  avkom(d.id).forEach(x => rows.push(["Avkom", x.id, x.idnr, x.navn, kjL(x), x.fodt]));
  sosken(d).forEach(s => rows.push([s.hel ? "Helsøsken" : "Halvsøsken", s.d.id, s.d.idnr, s.d.navn, kjL(s.d), s.d.fodt]));
  lagreCsv(filnavn(d) + "_relasjoner.csv", rows);
}
function pdf() {
  const d = byId(S.rap.id); if (!d) return;
  if (!window.jspdf) { toast("PDF-biblioteket ble ikke lastet. Sjekk nettforbindelsen."); return; }
  const A = A_(d), doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" }); let y = 18;
  const line = (t, o = {}) => { doc.setFont("helvetica", o.b ? "bold" : "normal"); doc.setFontSize(o.s || 10); const ls = doc.splitTextToSize(String(t), o.w || 180);
    ls.forEach(l => { if (y > 280) { doc.addPage(); y = 18; } doc.text(l, (o.x || 15), y); y += (o.s || 10) * 0.45; }); y += o.gap || 1.5; };
  const kv = (k, v) => { if (y > 280) { doc.addPage(); y = 18; } doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110); doc.text(k, 15, y); doc.setTextColor(20); doc.setFontSize(10); const ls = doc.splitTextToSize(String(v || "–"), 130); doc.text(ls, 60, y); y += 5.5 * ls.length; };
  doc.setFillColor(242, 194, 48); doc.rect(15, 10, 180, 1.6, "F");
  line(`Flokkboka · ${S.rap.type === "individ" ? "Individrapport" : "Relasjonsrapport"} · ${fmtD(today())} · ${arkivNavn(d.eier_id)}`, { s: 9, gap: 2 });
  line(label(d), { s: 18, b: true, gap: 2 });
  line(`${A.navn} · ${kjL(d)}${d.idnr ? " · " + d.idnr : ""} · ${d.status || "Aktiv"}`, { s: 10, gap: 5 });
  if (S.rap.type === "individ") {
    [[A.idLabel, d.idnr], ["Født", fmtD(d.fodt)], ["Alder", alder(d.fodt)], ["Rase", d.rase], ["Farge", d.farge], ...A.ekstra.map(e => [e.l, ex(d, e.k)]), [A.morL, label(byId(d.mor_id))], [A.farL, label(byId(d.far_id))], ["Antall avkom", String(avkom(d.id).length)], ["Siste vekt", sisteVekt(d.id)], ["Merknad", d.merknad]].forEach(([k, v]) => kv(k, v));
    y += 4; const hs = hendFor(d.id); line(`Hendelser og observasjoner (${hs.length})`, { s: 12, b: true, gap: 3 });
    hs.forEach(h => { line(`${h.dato}  ${h.type}${h.verdi ? "  (" + h.verdi + ")" : ""}`, { b: true, gap: .5 }); if (h.tekst) line(h.tekst, { x: 20, w: 175, gap: 2 }); });
  } else {
    const a = stamtre(d.id), ff = new Set(felles(d).map(x => x.id));
    line("Stamtavle", { s: 12, b: true, gap: 3 });
    const walk = (i, ind, rolle) => { if (i > 15) return; const x = byId(a[i]); line(`${rolle}: ${x ? label(x) + (x.idnr && x.navn ? " (" + x.idnr + ")" : "") + (ff.has(x.id) ? "  [FELLES ANE]" : "") : "ukjent"}`, { x: 15 + ind * 6, gap: .8 }); if (x) { walk(2 * i, ind + 1, rolle + "s far"); walk(2 * i + 1, ind + 1, rolle + "s mor"); } };
    walk(2, 0, "Far"); walk(3, 0, "Mor");
    if (ff.size) { y += 2; line("Innavlsvarsel: felles aner hos far og mor – " + [...ff].map(i => label(byId(i))).join(", "), { b: true, gap: 3 }); }
    y += 3; const av = avkom(d.id); line(`Avkom (${av.length})`, { s: 12, b: true, gap: 3 });
    av.forEach(x => line(`${x.fodt || "????"}  ${label(x)}${x.idnr && x.navn ? " (" + x.idnr + ")" : ""} · ${kjL(x)} · ${x.status || "Aktiv"} · egne avkom: ${avkom(x.id).length}`, { gap: .8 }));
    y += 3; const so = sosken(d); line(`Søsken (${so.length})`, { s: 12, b: true, gap: 3 });
    so.forEach(s => line(`${s.hel ? "Helsøsken" : "Halvsøsken"}: ${label(s.d)} · ${kjL(s.d)} · ${s.d.fodt || ""}`, { gap: .8 }));
  }
  lastNed(filnavn(d) + "_" + S.rap.type + "srapport.pdf", doc.output("blob"));
}

/* ---------- Deling og konto ---------- */
function deling() {
  const mine = S.delinger.filter(x => x.eier_id === S.me.id), tilMeg = S.delinger.filter(x => x.mottaker_id === S.me.id);
  const tilgSel = (x) => `<select class="inline" data-act-change="endretilgang" data-id="${x.id}" aria-label="Tilgang">${[["les", "Kan lese"], ["skriv", "Kan registrere og endre"]].map(([v, l]) => `<option value="${v}" ${x.tilgang === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
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
function render() {
  if (!S.me) return;
  $("#top").hidden = false;
  const navs = [["arkiv", "Arkiv"], ["rapporter", "Rapporter"], ["deling", "Deling"], ...(erAdmin() ? [["admin", "Admin"]] : [])];
  const aktivNav = ["arkiv", "dyr", "skjema"].includes(S.view) ? "arkiv" : S.view;
  $("#nav").innerHTML = navs.map(([v, l]) => `<button data-act="nav" data-v="${v}" aria-pressed="${aktivNav === v}">${l}</button>`).join("");
  $("#brand-sub").innerHTML = `${esc(S.me.navn || S.me.epost)}${erAdmin() ? ` <span class="role">Admin</span>` : ""} · <button class="linkbtn" data-act="loggut">Logg ut</button>`;
  const main = S.view === "skjema" && S.edit ? skjema() : S.view === "rapporter" ? rapporter() : S.view === "deling" ? deling() : S.view === "admin" ? admin() : detalj();
  const fokus = document.activeElement && document.activeElement.id, pos = fokus === "q" ? $("#q").selectionStart : null;
  const full = ["deling", "admin"].includes(S.view);
  $("#app").innerHTML = full ? `<div>${main}</div>` :
    `<div class="layout ${S.view === "arkiv" ? "" : "detail"}"><aside class="panel listpane">${listPane()}</aside><main class="panel mainpane">${main}</main></div>`;
  if (fokus === "q" && $("#q")) { const el = $("#q"); el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
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
const db = (res) => { if (res.error) throw res.error; return res; };

document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
  const a = b.dataset.act, id = b.dataset.id;
  const tidligereBekreft = S.bekreft;
  if (!["slett", "delhend", "fjerndeling"].includes(a)) S.bekreft = null;
  const toTrinn = nøkkel => { if (tidligereBekreft === nøkkel) { S.bekreft = null; return true; } S.bekreft = nøkkel; render(); return false; };

  switch (a) {
    case "authmode": S.auth = { mode: b.dataset.v, err: "", msg: "" }; renderAuth(); break;
    case "loggut": await S.sb.auth.signOut(); break;
    case "nav": S.view = b.dataset.v === "arkiv" && window.innerWidth >= 900 && S.sel ? "dyr" : b.dataset.v; S.hf = null; render(); window.scrollTo(0, 0); break;
    case "ny": nyttIndivid(); break;
    case "vis": S.sel = id; S.view = "dyr"; S.hf = null; render(); if (window.innerWidth < 900) window.scrollTo(0, 0); break;
    case "visarkiv": S.f.arkiv = id; S.f.status = "alle"; S.view = "arkiv"; render(); break;
    case "filt": S.f[b.dataset.k] = b.dataset.v; render(); break;
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
    case "rapport": S.rap = { id, type: b.dataset.t }; S.view = "rapporter"; render(); window.scrollTo(0, 0); break;
    case "raptype": S.rap.type = b.dataset.v; render(); break;
    case "pdf": pdf(); break;
    case "print": window.print(); break;
    case "csvind": csvInd(); break;
    case "csvalle": csvAlle(); break;
    case "csvhend": lagreCsv("flokkboka_hendelser_" + today() + ".csv", csvHendRader([...S.hend].sort((x, y) => (x.dato || "").localeCompare(y.dato || "")))); break;
  }
});
document.addEventListener("input", ev => { if (ev.target.id === "q") { S.f.q = ev.target.value; render(); } });
document.addEventListener("change", async ev => {
  const t = ev.target, ac = t.dataset.actChange;
  if (t.id === "fstatus") { S.f.status = t.value; render(); }
  else if (t.id === "farkiv") { S.f.arkiv = t.value; render(); }
  else if (t.id === "rap-id") { S.rap.id = t.value; render(); }
  else if (t.id === "h-type") { S.hf.type = t.value; S.hf.dato = $("#h-dato").value; S.hf.tekst = $("#h-tekst").value; render(); }
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
