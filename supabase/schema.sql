-- =====================================================================
-- Flokkboka – databaseskjema for Supabase
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.
-- Filen kan kjøres på nytt (også på en database i drift); den oppretter
-- og oppgraderer bare det som mangler, og sletter ingen data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabeller
-- ---------------------------------------------------------------------

-- Én profil per innlogget bruker.
-- Rolle: 'superadmin' (plattform), 'admin' (brukerstøtte) eller 'bruker'.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  epost      text not null,
  navn       text not null default '',
  rolle      text not null default 'bruker',
  aktiv      boolean not null default true,
  opprettet  timestamptz not null default now()
);
alter table public.profiles add column if not exists kilde text;   -- hvordan brukeren fant Flokkboka (deling, invitasjon …)
alter table public.profiles drop constraint if exists profiles_rolle_check;
alter table public.profiles add constraint profiles_rolle_check check (rolle in ('superadmin','admin','bruker'));

-- Arkiv-/besetningsdata. Ett arkiv per hovedeier.
create table if not exists public.arkiv (
  eier_id         uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  navn            text,          -- besetnings-/gårdsnavn
  type            text,          -- Gårdsbruk, Hobbydyrhold, Kennel, Stall …
  ansvarlig       text,          -- ansvarlig eier/driver
  orgnr           text check (orgnr is null or orgnr ~ '^[0-9]{9}$'),
  produsentnr     text,
  adresse         text,
  postnr          text,
  poststed        text,
  kommune         text,
  gnr             text,
  bnr             text,
  telefon         text,
  epost           text,
  nettside        text,
  veterinaer      text,
  veterinaer_tlf  text,
  registreringer  jsonb not null default '{}'::jsonb,   -- kontroll-medlemsnr, kennelnavn, helseprogram o.l.
  merknad         text,
  opprettet       timestamptz not null default now(),
  endret          timestamptz not null default now()
);

-- Individer. Hvert dyr tilhører arkivet til én eier.
-- Artsspesifikke felt (fødselsvekt, chip-nr osv.) ligger i "ekstra" (jsonb),
-- slik at nye dyreslag kan legges til uten å endre tabellen.
create table if not exists public.dyr (
  id           uuid primary key default gen_random_uuid(),
  eier_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  art          text not null default 'sau',
  idnr         text,
  navn         text,
  kjonn        text not null check (kjonn in ('hunn','hann')),
  fodt         date,
  rase         text,
  farge        text,
  status       text not null default 'Aktiv',
  status_dato  date,
  mor_id       uuid references public.dyr(id) on delete set null,
  far_id       uuid references public.dyr(id) on delete set null,
  merknad      text,
  bilde_path   text,
  ekstra       jsonb not null default '{}'::jsonb,
  opprettet    timestamptz not null default now(),
  endret       timestamptz not null default now(),
  constraint dyr_ikke_egen_forelder check (mor_id is distinct from id and far_id is distinct from id),
  constraint dyr_ulike_foreldre    check (mor_id is null or far_id is null or mor_id <> far_id)
);
-- Offentlig profil for deling i sosiale medier (valgfritt per individ).
alter table public.dyr add column if not exists offentlig boolean not null default false;
alter table public.dyr add column if not exists del_token text;
alter table public.dyr add column if not exists del_felt  jsonb not null default '[]'::jsonb;
alter table public.dyr add column if not exists del_tekst text;
create index if not exists dyr_eier_idx on public.dyr(eier_id);
create index if not exists dyr_mor_idx  on public.dyr(mor_id);
create index if not exists dyr_far_idx  on public.dyr(far_id);
create unique index if not exists dyr_idnr_unik on public.dyr(eier_id, art, idnr)
  where idnr is not null and idnr <> '';
create unique index if not exists dyr_del_token_unik on public.dyr(del_token) where del_token is not null;

-- Hendelser og observasjoner per individ.
create table if not exists public.hendelser (
  id             uuid primary key default gen_random_uuid(),
  dyr_id         uuid not null references public.dyr(id) on delete cascade,
  registrert_av  uuid default auth.uid() references public.profiles(id) on delete set null,
  type           text not null,
  dato           date not null default current_date,
  verdi          text,
  tekst          text,
  opprettet      timestamptz not null default now()
);
create index if not exists hendelser_dyr_idx on public.hendelser(dyr_id);
-- Felles observasjon: samme felles_id på alle hendelser som ble registrert samtidig på flere individer.
alter table public.hendelser add column if not exists felles_id uuid;
create index if not exists hendelser_felles_idx on public.hendelser(felles_id) where felles_id is not null;

-- Deling: en eier gir en annen bruker tilgang til hele arkivet sitt.
--   les      – kan se alt
--   skriv    – kan registrere og endre dyr og hendelser
--   medeier  – samme rettigheter som hovedeier (inntil 5 per arkiv)
create table if not exists public.delinger (
  id           uuid primary key default gen_random_uuid(),
  eier_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  mottaker_id  uuid not null references public.profiles(id) on delete cascade,
  tilgang      text not null default 'les',
  opprettet    timestamptz not null default now(),
  unique (eier_id, mottaker_id),
  check (eier_id <> mottaker_id)
);
alter table public.delinger drop constraint if exists delinger_tilgang_check;
alter table public.delinger add constraint delinger_tilgang_check check (tilgang in ('les','skriv','medeier'));
create index if not exists delinger_mottaker_idx on public.delinger(mottaker_id);

-- Invitasjoner til personer som ikke har konto ennå (eller som skal få lenke).
create table if not exists public.invitasjoner (
  id            uuid primary key default gen_random_uuid(),
  eier_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  epost         text not null,
  tilgang       text not null default 'medeier' check (tilgang in ('les','skriv','medeier')),
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invitert_av   uuid default auth.uid() references public.profiles(id) on delete set null,
  akseptert_av  uuid references public.profiles(id) on delete set null,
  akseptert     timestamptz,
  opprettet     timestamptz not null default now()
);
create index if not exists invitasjoner_epost_idx on public.invitasjoner(lower(epost)) where akseptert is null;

-- Favoritter (snarveier) per bruker.
create table if not exists public.favoritter (
  bruker_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dyr_id     uuid not null references public.dyr(id) on delete cascade,
  opprettet  timestamptz not null default now(),
  primary key (bruker_id, dyr_id)
);

-- Oppfølging av brukere (kun administrator/superadmin).
create table if not exists public.bruker_oppfolging (
  bruker_id   uuid primary key references public.profiles(id) on delete cascade,
  status      text,
  neste_dato  date,
  notat       text,
  endret_av   uuid default auth.uid() references public.profiles(id) on delete set null,
  opprettet   timestamptz not null default now(),
  endret      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Hjelpefunksjoner for tilgang
-- ---------------------------------------------------------------------

create or replace function public.er_aktiv() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aktiv from public.profiles where id = auth.uid()), false);
$$;

-- Administrator eller superadmin (ser og administrerer alle arkiv og brukere).
create or replace function public.er_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rolle in ('admin','superadmin') and aktiv from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.er_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rolle = 'superadmin' and aktiv from public.profiles where id = auth.uid()), false);
$$;

-- Er innlogget bruker medeier i arkivet til p_eier?
create or replace function public.er_medeier(p_eier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.delinger
                 where eier_id = p_eier and mottaker_id = auth.uid() and tilgang = 'medeier');
$$;

-- Kan innlogget bruker lese arkivet til p_eier?
create or replace function public.kan_lese(p_eier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.er_aktiv() and (
        p_eier = auth.uid()
     or public.er_admin()
     or exists (select 1 from public.delinger
                where eier_id = p_eier and mottaker_id = auth.uid()));
$$;

-- Kan innlogget bruker endre i arkivet til p_eier?
create or replace function public.kan_skrive(p_eier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.er_aktiv() and (
        p_eier = auth.uid()
     or public.er_admin()
     or exists (select 1 from public.delinger
                where eier_id = p_eier and mottaker_id = auth.uid() and tilgang in ('skriv','medeier')));
$$;

-- Har innlogget bruker eierrettigheter (hovedeier, medeier eller administrator)?
create or replace function public.kan_eie(p_eier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.er_aktiv() and (p_eier = auth.uid() or public.er_admin() or public.er_medeier(p_eier));
$$;

-- Deler innlogget bruker et arkiv med p_id (for å kunne se navnet til hverandre)?
create or replace function public.deler_arkiv_med(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delinger d
    where (d.eier_id = auth.uid() and d.mottaker_id = p_id)
       or (d.mottaker_id = auth.uid() and d.eier_id = p_id)
       or (d.mottaker_id = p_id and d.eier_id in
            (select eier_id from public.delinger where mottaker_id = auth.uid() and tilgang = 'medeier'))
  );
$$;

create or replace function public.dyr_eier(p_dyr uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select eier_id from public.dyr where id = p_dyr;
$$;

-- Leser eier-id fra første mappe i en filsti (bilder lagres som <eier_id>/<fil>).
create or replace function public.mappe_eier(p_navn text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_navn, '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- Er bildet hovedbildet til et individ som er delt offentlig med bilde?
create or replace function public.er_offentlig_bilde(p_navn text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dyr
                 where bilde_path = p_navn and offentlig and del_felt ? 'bilde');
$$;

-- ---------------------------------------------------------------------
-- 3. Triggere
-- ---------------------------------------------------------------------

-- Gjør invitasjoner om til deling for en bruker (brukes ved registrering og ved lenke).
create or replace function public.aktiver_invitasjon(p_inv public.invitasjoner, p_bruker uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_inv.eier_id = p_bruker then return; end if;
  perform set_config('flokkboka.invitasjon', '1', true);
  update public.invitasjoner set akseptert = now(), akseptert_av = p_bruker where id = p_inv.id;
  insert into public.delinger (eier_id, mottaker_id, tilgang)
  values (p_inv.eier_id, p_bruker, p_inv.tilgang)
  on conflict (eier_id, mottaker_id) do update
    set tilgang = case when public.delinger.tilgang = 'medeier' or excluded.tilgang = 'medeier' then 'medeier'
                       when public.delinger.tilgang = 'skriv' or excluded.tilgang = 'skriv' then 'skriv'
                       else 'les' end;
  perform set_config('flokkboka.invitasjon', '', true);
end $$;

-- Ny bruker -> profil. Den første brukeren blir superadmin.
-- Ventende invitasjoner (via lenke-token eller samme e-post) aktiveres automatisk.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitasjoner;
  tok text := new.raw_user_meta_data->>'invitasjon';
begin
  insert into public.profiles (id, epost, navn, rolle, kilde)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'navn', ''),
    case when exists (select 1 from public.profiles where rolle in ('admin','superadmin')) then 'bruker' else 'superadmin' end,
    nullif(coalesce(new.raw_user_meta_data->>'kilde', case when tok is not null then 'invitasjon' end), '')
  )
  on conflict (id) do nothing;

  for inv in
    select * from public.invitasjoner
    where akseptert is null
      and ((tok is not null and token = tok) or lower(epost) = lower(coalesce(new.email, '')))
  loop
    begin
      perform public.aktiver_invitasjon(inv, new.id);
    exception when others then
      null; -- f.eks. grensen på 5 medeiere er nådd; registreringen skal likevel gå gjennom
    end;
  end loop;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vern om roller: bare administrator kan endre rolle, aktiv-status og e-post.
-- Bare superadmin kan gi eller fjerne superadmin. Det må alltid finnes én aktiv superadmin.
-- Endringer gjort fra SQL Editor (ingen innlogget bruker) er tillatt.
create or replace function public.profiles_vern() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (new.rolle is distinct from old.rolle
      or new.aktiv is distinct from old.aktiv
      or new.epost is distinct from old.epost
      or new.kilde is distinct from old.kilde
      or new.id    is distinct from old.id) and not public.er_admin() then
    raise exception 'Bare administrator kan endre rolle og tilgang';
  end if;
  if (new.rolle = 'superadmin' or old.rolle = 'superadmin')
     and (new.rolle is distinct from old.rolle or new.aktiv is distinct from old.aktiv)
     and not public.er_superadmin() then
    raise exception 'Bare superadmin kan endre en superadmin';
  end if;
  if old.rolle = 'superadmin' and old.aktiv and (new.rolle <> 'superadmin' or not new.aktiv)
     and (select count(*) from public.profiles where rolle = 'superadmin' and aktiv) <= 1 then
    raise exception 'Det må finnes minst én aktiv superadmin';
  end if;
  return new;
end $$;

drop trigger if exists profiles_vern on public.profiles;
create trigger profiles_vern
  before update on public.profiles
  for each row execute function public.profiles_vern();

-- Medeiere: bare hovedeier (eller administrator) styrer medeiere, og maks 5 per arkiv
-- (ventende medeier-invitasjoner teller med).
create or replace function public.delinger_vern() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  antall int;
  via_invitasjon boolean := coalesce(current_setting('flokkboka.invitasjon', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    if old.tilgang = 'medeier' and auth.uid() is not null and auth.uid() not in (old.eier_id, old.mottaker_id)
       and not public.er_admin() then
      raise exception 'Bare hovedeier kan fjerne en medeier';
    end if;
    return old;
  end if;
  if (new.tilgang = 'medeier' or (tg_op = 'UPDATE' and old.tilgang = 'medeier'))
     and auth.uid() is not null and not via_invitasjon
     and auth.uid() <> new.eier_id and not public.er_admin() then
    raise exception 'Bare hovedeier kan legge til eller endre medeiere';
  end if;
  if new.tilgang = 'medeier' and (tg_op = 'INSERT' or old.tilgang <> 'medeier') then
    select count(*) into antall from public.delinger
      where eier_id = new.eier_id and tilgang = 'medeier' and id <> new.id;
    select antall + count(*) into antall from public.invitasjoner
      where eier_id = new.eier_id and tilgang = 'medeier' and akseptert is null
        and lower(epost) <> lower(coalesce((select epost from public.profiles where id = new.mottaker_id), ''));
    if antall >= 5 then
      raise exception 'Et arkiv kan ha inntil 5 medeiere';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists delinger_vern on public.delinger;
create trigger delinger_vern
  before insert or update or delete on public.delinger
  for each row execute function public.delinger_vern();

create or replace function public.invitasjoner_vern() returns trigger
language plpgsql security definer set search_path = public as $$
declare antall int;
begin
  new.epost := lower(trim(new.epost));
  if tg_op = 'INSERT' and new.tilgang = 'medeier' then
    if auth.uid() is not null and auth.uid() <> new.eier_id and not public.er_admin() then
      raise exception 'Bare hovedeier kan invitere medeiere';
    end if;
    select count(*) into antall from public.delinger where eier_id = new.eier_id and tilgang = 'medeier';
    select antall + count(*) into antall from public.invitasjoner
      where eier_id = new.eier_id and tilgang = 'medeier' and akseptert is null;
    if antall >= 5 then
      raise exception 'Et arkiv kan ha inntil 5 medeiere (ventende invitasjoner teller med)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists invitasjoner_vern on public.invitasjoner;
create trigger invitasjoner_vern
  before insert on public.invitasjoner
  for each row execute function public.invitasjoner_vern();

create or replace function public.sett_endret() returns trigger
language plpgsql as $$
begin
  new.endret := now();
  return new;
end $$;

drop trigger if exists arkiv_endret on public.arkiv;
create trigger arkiv_endret before update on public.arkiv
  for each row execute function public.sett_endret();
drop trigger if exists oppfolging_endret on public.bruker_oppfolging;
create trigger oppfolging_endret before update on public.bruker_oppfolging
  for each row execute function public.sett_endret();

-- Valider foreldrerelasjoner: riktig kjønn, samme art, tilgjengelig for brukeren, ingen sløyfer.
create or replace function public.dyr_valider() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m public.dyr;
  syklus boolean;
begin
  new.endret := now();

  if tg_op = 'UPDATE' and new.eier_id is distinct from old.eier_id
     and auth.uid() is not null and not public.er_admin() then
    raise exception 'Bare administrator kan flytte et individ til et annet arkiv';
  end if;

  if new.mor_id is not null then
    select * into m from public.dyr where id = new.mor_id;
    if m.id is null or (auth.uid() is not null and not public.kan_lese(m.eier_id)) then
      raise exception 'Valgt mor finnes ikke eller er ikke tilgjengelig';
    end if;
    if m.kjonn <> 'hunn' or m.art <> new.art then
      raise exception 'Mor må være et hunndyr av samme art';
    end if;
  end if;

  if new.far_id is not null then
    select * into m from public.dyr where id = new.far_id;
    if m.id is null or (auth.uid() is not null and not public.kan_lese(m.eier_id)) then
      raise exception 'Valgt far finnes ikke eller er ikke tilgjengelig';
    end if;
    if m.kjonn <> 'hann' or m.art <> new.art then
      raise exception 'Far må være et hanndyr av samme art';
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.mor_id is not null or new.far_id is not null) then
    with recursive aner(id) as (
      select x from unnest(array[new.mor_id, new.far_id]) as x where x is not null
      union
      select y from public.dyr d
        join aner a on d.id = a.id
        cross join lateral unnest(array[d.mor_id, d.far_id]) as y
      where y is not null
    )
    select exists (select 1 from aner where id = new.id) into syklus;
    if syklus then
      raise exception 'Et individ kan ikke være sin egen forfar';
    end if;
  end if;

  if new.offentlig and new.del_token is null then
    new.del_token := replace(gen_random_uuid()::text, '-', '');
  end if;

  return new;
end $$;

drop trigger if exists dyr_valider on public.dyr;
create trigger dyr_valider
  before insert or update on public.dyr
  for each row execute function public.dyr_valider();

-- ---------------------------------------------------------------------
-- 4. Radnivåsikkerhet (RLS)
-- ---------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.arkiv             enable row level security;
alter table public.dyr               enable row level security;
alter table public.hendelser         enable row level security;
alter table public.delinger          enable row level security;
alter table public.invitasjoner      enable row level security;
alter table public.favoritter        enable row level security;
alter table public.bruker_oppfolging enable row level security;

-- profiles: se deg selv, de du deler arkiv med, eller alle hvis admin
drop policy if exists profiles_les on public.profiles;
create policy profiles_les on public.profiles for select to authenticated using (
  id = auth.uid() or public.er_admin() or public.deler_arkiv_med(id)
);
drop policy if exists profiles_endre on public.profiles;
create policy profiles_endre on public.profiles for update to authenticated
  using (id = auth.uid() or public.er_admin())
  with check (id = auth.uid() or public.er_admin());

-- arkiv (besetningsdata)
drop policy if exists arkiv_les on public.arkiv;
create policy arkiv_les on public.arkiv for select to authenticated
  using (public.kan_lese(eier_id) or public.deler_arkiv_med(eier_id));
drop policy if exists arkiv_ny on public.arkiv;
create policy arkiv_ny on public.arkiv for insert to authenticated
  with check (public.kan_eie(eier_id));
drop policy if exists arkiv_endre on public.arkiv;
create policy arkiv_endre on public.arkiv for update to authenticated
  using (public.kan_eie(eier_id)) with check (public.kan_eie(eier_id));

-- dyr
drop policy if exists dyr_les on public.dyr;
create policy dyr_les on public.dyr for select to authenticated
  using (public.kan_lese(eier_id));
drop policy if exists dyr_ny on public.dyr;
create policy dyr_ny on public.dyr for insert to authenticated
  with check (public.kan_skrive(eier_id));
drop policy if exists dyr_endre on public.dyr;
create policy dyr_endre on public.dyr for update to authenticated
  using (public.kan_skrive(eier_id)) with check (public.kan_skrive(eier_id));
drop policy if exists dyr_slett on public.dyr;
create policy dyr_slett on public.dyr for delete to authenticated
  using (public.kan_eie(eier_id));

-- hendelser (følger arkivet til dyret)
drop policy if exists hendelser_les on public.hendelser;
create policy hendelser_les on public.hendelser for select to authenticated
  using (public.kan_lese(public.dyr_eier(dyr_id)));
drop policy if exists hendelser_ny on public.hendelser;
create policy hendelser_ny on public.hendelser for insert to authenticated
  with check (public.kan_skrive(public.dyr_eier(dyr_id)));
drop policy if exists hendelser_endre on public.hendelser;
create policy hendelser_endre on public.hendelser for update to authenticated
  using (public.kan_skrive(public.dyr_eier(dyr_id))) with check (public.kan_skrive(public.dyr_eier(dyr_id)));
drop policy if exists hendelser_slett on public.hendelser;
create policy hendelser_slett on public.hendelser for delete to authenticated
  using (public.kan_skrive(public.dyr_eier(dyr_id)));

-- delinger (medeier-regler håndheves i triggeren delinger_vern)
drop policy if exists delinger_les on public.delinger;
create policy delinger_les on public.delinger for select to authenticated
  using (eier_id = auth.uid() or mottaker_id = auth.uid() or public.er_admin() or public.er_medeier(eier_id));
drop policy if exists delinger_ny on public.delinger;
create policy delinger_ny on public.delinger for insert to authenticated
  with check (public.kan_eie(eier_id));
drop policy if exists delinger_endre on public.delinger;
create policy delinger_endre on public.delinger for update to authenticated
  using (public.kan_eie(eier_id)) with check (public.kan_eie(eier_id));
drop policy if exists delinger_slett on public.delinger;
create policy delinger_slett on public.delinger for delete to authenticated
  using (eier_id = auth.uid() or mottaker_id = auth.uid() or public.er_admin()
         or (public.er_medeier(eier_id) and tilgang <> 'medeier'));

-- invitasjoner
drop policy if exists invitasjoner_les on public.invitasjoner;
create policy invitasjoner_les on public.invitasjoner for select to authenticated
  using (public.kan_eie(eier_id));
drop policy if exists invitasjoner_ny on public.invitasjoner;
create policy invitasjoner_ny on public.invitasjoner for insert to authenticated
  with check (public.kan_eie(eier_id));
drop policy if exists invitasjoner_slett on public.invitasjoner;
create policy invitasjoner_slett on public.invitasjoner for delete to authenticated
  using (public.kan_eie(eier_id));

-- favoritter: bare egne
drop policy if exists favoritter_les on public.favoritter;
create policy favoritter_les on public.favoritter for select to authenticated
  using (bruker_id = auth.uid());
drop policy if exists favoritter_ny on public.favoritter;
create policy favoritter_ny on public.favoritter for insert to authenticated
  with check (bruker_id = auth.uid() and public.kan_lese(public.dyr_eier(dyr_id)));
drop policy if exists favoritter_slett on public.favoritter;
create policy favoritter_slett on public.favoritter for delete to authenticated
  using (bruker_id = auth.uid());

-- oppfølging: bare administrator
drop policy if exists oppfolging_alt on public.bruker_oppfolging;
create policy oppfolging_alt on public.bruker_oppfolging for all to authenticated
  using (public.er_admin()) with check (public.er_admin());

-- ---------------------------------------------------------------------
-- 5. Funksjoner som appen kaller (RPC)
-- ---------------------------------------------------------------------

-- Oppslag av bruker ved deling (eksakt e-post, avslører ikke brukerlisten)
create or replace function public.finn_bruker(p_epost text)
returns table (id uuid, navn text, epost text)
language sql stable security definer set search_path = public as $$
  select p.id, p.navn, p.epost from public.profiles p
  where public.er_aktiv() and p.aktiv and lower(p.epost) = lower(trim(p_epost))
  limit 1;
$$;
revoke all on function public.finn_bruker(text) from public, anon;
grant execute on function public.finn_bruker(text) to authenticated;

-- Informasjon om en invitasjon (vises før innlogging/registrering).
create or replace function public.invitasjon_info(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'arkiv', coalesce(nullif(a.navn, ''), nullif(p.navn, ''), 'et arkiv i Flokkboka'),
    'invitert_av', coalesce(nullif(iv.navn, ''), iv.epost),
    'tilgang', i.tilgang, 'epost', i.epost, 'gyldig', i.akseptert is null)
  from public.invitasjoner i
  join public.profiles p on p.id = i.eier_id
  left join public.arkiv a on a.eier_id = i.eier_id
  left join public.profiles iv on iv.id = i.invitert_av
  where i.token = p_token;
$$;
grant execute on function public.invitasjon_info(text) to anon, authenticated;

-- Godta invitasjon via lenke for innlogget bruker.
create or replace function public.bruk_invitasjon(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.invitasjoner;
begin
  if auth.uid() is null then raise exception 'Du må være innlogget'; end if;
  if not public.er_aktiv() then raise exception 'Kontoen din er stengt. Kontakt administrator.'; end if;
  select * into inv from public.invitasjoner where token = p_token for update;
  if inv.id is null then raise exception 'Invitasjonen finnes ikke'; end if;
  if inv.akseptert is not null then
    return jsonb_build_object('status', case when inv.akseptert_av = auth.uid() then 'allerede' else 'brukt' end);
  end if;
  if inv.eier_id = auth.uid() then raise exception 'Du kan ikke godta en invitasjon til ditt eget arkiv'; end if;
  perform public.aktiver_invitasjon(inv, auth.uid());
  return jsonb_build_object('status', 'ok', 'tilgang', inv.tilgang, 'eier_id', inv.eier_id);
end $$;
revoke all on function public.bruk_invitasjon(text) from public, anon;
grant execute on function public.bruk_invitasjon(text) to authenticated;

-- Offentlig profil for et individ som eieren har valgt å dele (kan leses uten innlogging).
create or replace function public.offentlig_profil(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d public.dyr; f jsonb;
begin
  select * into d from public.dyr where del_token = p_token and offentlig;
  if d.id is null then return null; end if;
  f := coalesce(d.del_felt, '[]'::jsonb);
  return jsonb_strip_nulls(jsonb_build_object(
    'navn', coalesce(nullif(d.navn, ''), d.idnr),
    'art', d.art, 'kjonn', d.kjonn,
    'kastrert', coalesce(d.ekstra->>'vallak', d.ekstra->>'kastrert'),
    'tekst', d.del_tekst,
    'idnr', case when f ? 'idnr' then d.idnr end,
    'rase', case when f ? 'rase' then d.rase end,
    'fodt', case when f ? 'fodt' then d.fodt end,
    'farge', case when f ? 'farge' then d.farge end,
    'kallenavn', case when f ? 'kallenavn' then d.ekstra->>'kallenavn' end,
    'bilde', case when f ? 'bilde' then d.bilde_path end,
    'status', d.status,
    'mor', case when f ? 'foreldre' then (select coalesce(nullif(navn, ''), idnr) from public.dyr where id = d.mor_id) end,
    'far', case when f ? 'foreldre' then (select coalesce(nullif(navn, ''), idnr) from public.dyr where id = d.far_id) end,
    'avkom', case when f ? 'avkom' then (select count(*) from public.dyr where mor_id = d.id or far_id = d.id) end,
    'resultater', case when f ? 'resultater' then (
      select jsonb_agg(jsonb_build_object('dato', h.dato, 'type', h.type, 'verdi', h.verdi, 'tekst', h.tekst) order by h.dato desc)
      from public.hendelser h
      where h.dyr_id = d.id and h.type in ('Gjeterprøve','Jaktprøve','Utstilling','Konkurranse','Kåring/bedømmelse','Avlsvurdering','HD/AD-røntgen')) end,
    'besetning', case when f ? 'besetning' then (
      select coalesce(nullif(a.navn, ''), nullif(a.registreringer->>'kennelnavn', ''), nullif(a.registreringer->>'stallnavn', ''))
      from public.arkiv a where a.eier_id = d.eier_id) end
  ));
end $$;
grant execute on function public.offentlig_profil(text) to anon, authenticated;

-- Plattformstatistikk for superadmin: brukere, arkiv, dyreslag, aktivitet og ressursbruk.
create or replace function public.plattform_statistikk() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.er_superadmin() then
    raise exception 'Bare superadmin har tilgang til plattformstatistikk';
  end if;
  select jsonb_build_object(
    'tidspunkt', now(),
    'database_bytes', pg_database_size(current_database()),
    'tabeller', (
      select jsonb_agg(jsonb_build_object('navn', c.relname, 'bytes', pg_total_relation_size(c.oid),
                                          'rader', greatest(c.reltuples, 0)::bigint)
                       order by pg_total_relation_size(c.oid) desc)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'),
    'lagring', (
      select jsonb_build_object('bytes', coalesce(sum((metadata->>'size')::bigint), 0), 'filer', count(*))
      from storage.objects where bucket_id = 'dyrebilder'),
    'db_aktivitet', (
      select jsonb_build_object(
        'transaksjoner', xact_commit + xact_rollback,
        'rader_lest', tup_returned + tup_fetched,
        'rader_skrevet', tup_inserted + tup_updated + tup_deleted,
        'cache_treff', case when blks_hit + blks_read > 0 then round(100.0 * blks_hit / (blks_hit + blks_read), 1) end,
        'statistikk_fra', stats_reset)
      from pg_stat_database where datname = current_database()),
    'tilkoblinger', (select count(*) from pg_stat_activity where datname = current_database()),
    'arter', (
      select coalesce(jsonb_object_agg(art, jsonb_build_object('totalt', n, 'aktive', a)), '{}'::jsonb)
      from (select art, count(*) n, count(*) filter (where status = 'Aktiv') a from public.dyr group by art) x),
    'maaneder', (
      select jsonb_agg(jsonb_build_object(
        'maaned', to_char(m, 'YYYY-MM'),
        'nye_brukere', (select count(*) from public.profiles where date_trunc('month', opprettet) = m),
        'nye_dyr', (select count(*) from public.dyr where date_trunc('month', opprettet) = m),
        'hendelser', (select count(*) from public.hendelser where date_trunc('month', opprettet) = m)) order by m)
      from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m),
    'brukere', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'epost', p.epost, 'navn', p.navn, 'rolle', p.rolle, 'aktiv', p.aktiv,
        'opprettet', p.opprettet, 'kilde', p.kilde,
        'sist_innlogget', u.last_sign_in_at, 'bekreftet', u.email_confirmed_at is not null,
        'arkivnavn', a.navn, 'orgnr', a.orgnr, 'produsentnr', a.produsentnr,
        'dyr', (select count(*) from public.dyr where eier_id = p.id),
        'dyr_aktive', (select count(*) from public.dyr where eier_id = p.id and status = 'Aktiv'),
        'arter', (select coalesce(jsonb_object_agg(art, n), '{}'::jsonb)
                  from (select art, count(*) n from public.dyr where eier_id = p.id group by art) x),
        'hendelser', (select count(*) from public.hendelser h join public.dyr d on d.id = h.dyr_id where d.eier_id = p.id),
        'siste_aktivitet', greatest(u.last_sign_in_at,
                                    (select max(endret) from public.dyr where eier_id = p.id),
                                    (select max(opprettet) from public.hendelser where registrert_av = p.id)),
        'bilde_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects
                        where bucket_id = 'dyrebilder' and public.mappe_eier(name) = p.id),
        'bilder', (select count(*) from storage.objects where bucket_id = 'dyrebilder' and public.mappe_eier(name) = p.id),
        'medeiere', (select count(*) from public.delinger where eier_id = p.id and tilgang = 'medeier'),
        'delinger', (select count(*) from public.delinger where eier_id = p.id),
        'offentlige', (select count(*) from public.dyr where eier_id = p.id and offentlig),
        'favoritter', (select count(*) from public.favoritter where bruker_id = p.id),
        'oppfolging', (select to_jsonb(o) - 'bruker_id' from public.bruker_oppfolging o where o.bruker_id = p.id)
      ) order by p.opprettet), '[]'::jsonb)
      from public.profiles p
      left join auth.users u on u.id = p.id
      left join public.arkiv a on a.eier_id = p.id)
  ) into res;
  return res;
end $$;
revoke all on function public.plattform_statistikk() from public, anon;
grant execute on function public.plattform_statistikk() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Bildelagring (privat bucket, sti: <eier_id>/<dyr_id>-<tid>.<ext>)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dyrebilder', 'dyrebilder', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

drop policy if exists dyrebilder_les on storage.objects;
create policy dyrebilder_les on storage.objects for select to authenticated
  using (bucket_id = 'dyrebilder' and public.kan_lese(public.mappe_eier(name)));
-- Bilder på offentlig delte profiler kan vises uten innlogging.
drop policy if exists dyrebilder_offentlig on storage.objects;
create policy dyrebilder_offentlig on storage.objects for select to anon, authenticated
  using (bucket_id = 'dyrebilder' and public.er_offentlig_bilde(name));
drop policy if exists dyrebilder_ny on storage.objects;
create policy dyrebilder_ny on storage.objects for insert to authenticated
  with check (bucket_id = 'dyrebilder' and public.kan_skrive(public.mappe_eier(name)));
drop policy if exists dyrebilder_endre on storage.objects;
create policy dyrebilder_endre on storage.objects for update to authenticated
  using (bucket_id = 'dyrebilder' and public.kan_skrive(public.mappe_eier(name)));
drop policy if exists dyrebilder_slett on storage.objects;
create policy dyrebilder_slett on storage.objects for delete to authenticated
  using (bucket_id = 'dyrebilder' and public.kan_skrive(public.mappe_eier(name)));

-- ---------------------------------------------------------------------
-- 7. Engangsoppgradering: eldste administrator blir superadmin
--    (gjelder databaser satt opp før superadmin-rollen fantes)
-- ---------------------------------------------------------------------
update public.profiles set rolle = 'superadmin'
where id = (select id from public.profiles where rolle = 'admin' and aktiv order by opprettet limit 1)
  and not exists (select 1 from public.profiles where rolle = 'superadmin');

-- ---------------------------------------------------------------------
-- 8. (Valgfritt) Lesebruker for Power BI / Excel
-- Fjern kommentartegnene, velg et sterkt passord og kjør.
-- Koble til via Supabase: Project Settings -> Database -> Connection string.
-- ---------------------------------------------------------------------
-- create role rapport_leser with login password 'BYTT-TIL-STERKT-PASSORD' bypassrls;
-- grant usage on schema public to rapport_leser;
-- grant select on public.dyr, public.hendelser, public.profiles, public.delinger, public.arkiv to rapport_leser;
