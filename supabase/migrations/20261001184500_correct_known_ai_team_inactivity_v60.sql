-- Correct known curated AI teams that were accidentally stored as user-controlled clubs.
-- Four Albania Association Test teams are intentionally excluded because their classification is still undecided.
-- Genuine user teams are left untouched.

with known_ai(name) as (
  values
    ('Air Carpathian Team'),
    ('Ajax Veluwe Pro Peloton'),
    ('Ampol Pro Cycling Team'),
    ('Antalya Heritage Velo'),
    ('Aritzia Vancouver Team'),
    ('AS Côte d’Azur Pro Peloton'),
    ('ASML Cycling Team'),
    ('Aurora Energy Pro'),
    ('Bankia Pro Team'),
    ('Barcelona Pro Team'),
    ('Bell MTS Team'),
    ('BHP Pro Cycling'),
    ('BK Dubrovnik'),
    ('BK Rijeka'),
    ('BK Zadar'),
    ('Black Sea Pro Cycling'),
    ('Brisbane Pro'),
    ('Bucharest Road Team'),
    ('Bursa CK'),
    ('Constanța OMV Petrol Team'),
    ('Croatia Airlines Pro Cycling'),
    ('Cycling Unicaja'),
    ('Eindhoven Pro Team'),
    ('Eskom pro team'),
    ('Eureka Cycling Team'),
    ('Exaro Team'),
    ('Fonterra Pro Team'),
    ('Galatasaray CT'),
    ('Heineken Pro Cycling'),
    ('Iberdrola Road Team'),
    ('Inviva Wines'),
    ('Johannesburg Pro Team'),
    ('La Poste Pro Team'),
    ('Limburg Cyclists'),
    ('Orange Team'),
    ('Paris SG'),
    ('Poli Timisoara'),
    ('Rio tinto cycling team'),
    ('Sibiu Cycling Team'),
    ('Suncor Energy Team'),
    ('Team Comm100'),
    ('Team Jadrolinija'),
    ('Team Mondi'),
    ('Team Sodexo'),
    ('Toronto-Dominion Bank'),
    ('Turkish Airlines Ankara Pro Racing'),
    ('Valladolid BBVA Team'),
    ('Vodacom Pro Cycling'),
    ('Wellington Cycling team'),
    ('Zespri Pro')
)
update public.clubs c
set
  is_ai = true,
  owner_user_id = null,
  is_active = true,
  inactivity_status = 'active',
  inactive_at = null,
  archived_at = null,
  inactivity_reason = null,
  inactive_ai_controlled = false,
  season_end_transition_pending = false,
  inactivity_days_snapshot = null,
  inactivity_effective_season = null,
  inactivity_season_end_action = null,
  updated_at = now()
from known_ai k
where c.name = k.name
  and c.deleted_at is null
  and coalesce(c.club_type, 'main') = 'main';

-- Defensive display rule: an "Inactive manager" badge can only belong to a
-- genuine, non-AI, owned main club.
create or replace function public.get_public_club_inactivity_statuses_v1(p_club_ids uuid[])
returns table(
  club_id uuid,
  public_inactivity_status text,
  inactivity_days_snapshot integer,
  season_end_transition_pending boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    c.id as club_id,
    case
      when coalesce(c.is_ai, false) = false
       and c.owner_user_id is not null
       and coalesce(c.club_type, 'main') = 'main'
       and c.inactivity_status in ('inactive', 'season_end_removal_pending')
        then c.inactivity_status
      else null
    end as public_inactivity_status,
    case
      when coalesce(c.is_ai, false) = false
       and c.owner_user_id is not null
       and coalesce(c.club_type, 'main') = 'main'
       and c.inactivity_status in ('inactive', 'season_end_removal_pending')
        then c.inactivity_days_snapshot
      else null
    end as inactivity_days_snapshot,
    case
      when coalesce(c.is_ai, false) = false
       and c.owner_user_id is not null
       and coalesce(c.club_type, 'main') = 'main'
       and c.inactivity_status = 'season_end_removal_pending'
        then coalesce(c.season_end_transition_pending, false)
      else false
    end as season_end_transition_pending
  from public.clubs c
  where c.id = any(p_club_ids)
    and c.deleted_at is null;
$function$;
