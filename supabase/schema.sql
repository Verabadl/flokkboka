-- =====================================================================
-- Flokkboka – databaseskjema for Supabase
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.
-- Filen kan kjøres på nytt; den oppretter bare det som mangler.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tabeller
-- ---------------------------------------------------------------------

-- Én profil per innlogget bruker. Rolle: 'admin' eller 'bruker'.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  epost      text not null,
  navn       text not null default '',
  rolle      text not null default 'bruker' check (rolle in ('admin','bruker')),
  aktiv      boolean not null default true,
  opprettet  timestamptz not null default now()
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
create index if not exists dyr_eier_idx on public.dyr(eier_id);
create index if not exists dyr_mor_idx  on public.dyr(mor_id);
create index if not exists dyr_far_idx  on public.dyr(far_id);
create unique index if not exists dyr_idnr_unik on public.dyr(eier_id, art, idnr)
  where idnr is not null and idnr <> '';

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

-- Deling: en eier gir en annen bruker lese- eller skrivetilgang til hele arkivet sitt.
create table if not exists public.delinger (
  id           uuid primary key default gen_random_uuid(),
  eier_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  mottaker_id  uuid not null references public.profiles(id) on delete cascade,
  tilgang      text not null default 'les' check (tilgang in ('les','skriv')),
  opprettet    timestamptz not null default now(),
  unique (eier_id, mottaker_id),
  check (eier_id <> mottaker_id)
);
create index if not exists delinger_mottaker_idx on public.delinger(mottaker_id);

-- ---------------------------------------------------------------------
-- 2. Hjelpefunksjoner for tilgang
-- ---------------------------------------------------------------------

create or replace function public.er_aktiv() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aktiv from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.er_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rolle = 'admin' and aktiv from public.profiles where id = auth.uid()), false);
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
                where eier_id = p_eier and mottaker_id = auth.uid() and tilgang = 'skriv'));
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

-- ---------------------------------------------------------------------
-- 3. Triggere
-- ---------------------------------------------------------------------

-- Ny bruker -> profil. Den første brukeren blir administrator.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, epost, navn, rolle)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'navn', ''),
    case when exists (select 1 from public.profiles where rolle = 'admin') then 'bruker' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vern om roller: bare administrator kan endre rolle, aktiv-status og e-post.
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
      or new.id    is distinct from old.id) and not public.er_admin() then
    raise exception 'Bare administrator kan endre rolle og tilgang';
  end if;
  if old.rolle = 'admin' and old.aktiv and (new.rolle <> 'admin' or not new.aktiv)
     and (select count(*) from public.profiles where rolle = 'admin' and aktiv) <= 1 then
    raise exception 'Det må finnes minst én aktiv administrator';
  end if;
  return new;
end $$;

drop trigger if exists profiles_vern on public.profiles;
create trigger profiles_vern
  before update on public.profiles
  for each row execute function public.profiles_vern();

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

  return new;
end $$;

drop trigger if exists dyr_valider on public.dyr;
create trigger dyr_valider
  before insert or update on public.dyr
  for each row execute function public.dyr_valider();

-- ---------------------------------------------------------------------
-- 4. Radnivåsikkerhet (RLS)
-- ---------------------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.dyr       enable row level security;
alter table public.hendelser enable row level security;
alter table public.delinger  enable row level security;

-- profiles: se deg selv, de du deler med, eller alle hvis admin
drop policy if exists profiles_les on public.profiles;
create policy profiles_les on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.er_admin()
  or exists (select 1 from public.delinger d
             where (d.eier_id = auth.uid() and d.mottaker_id = profiles.id)
                or (d.mottaker_id = auth.uid() and d.eier_id = profiles.id))
);
drop policy if exists profiles_endre on public.profiles;
create policy profiles_endre on public.profiles for update to authenticated
  using (id = auth.uid() or public.er_admin())
  with check (id = auth.uid() or public.er_admin());

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
  using ((eier_id = auth.uid() and public.er_aktiv()) or public.er_admin());

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

-- delinger
drop policy if exists delinger_les on public.delinger;
create policy delinger_les on public.delinger for select to authenticated
  using (eier_id = auth.uid() or mottaker_id = auth.uid() or public.er_admin());
drop policy if exists delinger_ny on public.delinger;
create policy delinger_ny on public.delinger for insert to authenticated
  with check ((eier_id = auth.uid() and public.er_aktiv()) or public.er_admin());
drop policy if exists delinger_endre on public.delinger;
create policy delinger_endre on public.delinger for update to authenticated
  using ((eier_id = auth.uid() and public.er_aktiv()) or public.er_admin())
  with check ((eier_id = auth.uid() and public.er_aktiv()) or public.er_admin());
drop policy if exists delinger_slett on public.delinger;
create policy delinger_slett on public.delinger for delete to authenticated
  using (eier_id = auth.uid() or mottaker_id = auth.uid() or public.er_admin());

-- ---------------------------------------------------------------------
-- 5. Oppslag av bruker ved deling (eksakt e-post, avslører ikke brukerlisten)
-- ---------------------------------------------------------------------
create or replace function public.finn_bruker(p_epost text)
returns table (id uuid, navn text, epost text)
language sql stable security definer set search_path = public as $$
  select p.id, p.navn, p.epost from public.profiles p
  where public.er_aktiv() and p.aktiv and lower(p.epost) = lower(trim(p_epost))
  limit 1;
$$;
revoke all on function public.finn_bruker(text) from public, anon;
grant execute on function public.finn_bruker(text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Bildelagring (privat bucket, sti: <eier_id>/<dyr_id>-<tid>.<ext>)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dyrebilder', 'dyrebilder', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

drop policy if exists dyrebilder_les on storage.objects;
create policy dyrebilder_les on storage.objects for select to authenticated
  using (bucket_id = 'dyrebilder' and public.kan_lese(public.mappe_eier(name)));
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
-- 7. (Valgfritt) Lesebruker for Power BI / Excel
-- Fjern kommentartegnene, velg et sterkt passord og kjør.
-- Koble til via Supabase: Project Settings -> Database -> Connection string.
-- ---------------------------------------------------------------------
-- create role rapport_leser with login password 'BYTT-TIL-STERKT-PASSORD' bypassrls;
-- grant usage on schema public to rapport_leser;
-- grant select on public.dyr, public.hendelser, public.profiles, public.delinger to rapport_leser;
