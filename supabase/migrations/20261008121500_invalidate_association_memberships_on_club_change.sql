-- Keep National Association membership and coach state aligned with a club's
-- eligibility as soon as a club is deleted or ceases to be an eligible owner.
CREATE OR REPLACE FUNCTION private.invalidate_national_association_memberships_on_club_change_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_today date;
BEGIN
  IF new.deleted_at IS NULL
     AND coalesce(new.is_ai,false)=false
     AND new.club_type='main'
     AND coalesce(new.is_active,true)=true
     AND coalesce(new.inactivity_status,'active')='active'
     AND EXISTS (
       SELECT 1
       FROM public.national_association_memberships m
       JOIN public.national_associations a ON a.id=m.association_id
       WHERE m.club_id=new.id
         AND m.status='active'
         AND m.user_id=new.owner_user_id
         AND upper(new.country_code)=upper(a.country_code)
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.national_association_memberships m
       JOIN public.national_associations a ON a.id=m.association_id
       WHERE m.club_id=new.id
         AND m.status='active'
         AND (m.user_id IS DISTINCT FROM new.owner_user_id
              OR upper(new.country_code) IS DISTINCT FROM upper(a.country_code))
     )
  THEN
    RETURN new;
  END IF;

  v_today:=public.get_current_game_date_date();

  UPDATE public.national_association_memberships m
  SET status='ineligible',
      coach_eligible=false,
      left_on_game_date=coalesce(m.left_on_game_date,v_today),
      updated_at=now()
  FROM public.national_associations a
  WHERE m.club_id=new.id
    AND m.association_id=a.id
    AND m.status='active'
    AND (new.deleted_at IS NOT NULL
         OR coalesce(new.is_ai,false)=true
         OR new.club_type IS DISTINCT FROM 'main'
         OR coalesce(new.is_active,true)=false
         OR coalesce(new.inactivity_status,'active')<>'active'
         OR m.user_id IS DISTINCT FROM new.owner_user_id
         OR upper(new.country_code) IS DISTINCT FROM upper(a.country_code));

  UPDATE public.national_coach_terms t
  SET status='ineligible',
      term_end_game_date=greatest(t.term_start_game_date,v_today),
      updated_at=now()
  WHERE t.club_id=new.id
    AND t.status='active'
    AND NOT private.national_association_member_is_eligible_v1(t.association_id,t.user_id);

  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION private.invalidate_national_association_memberships_on_club_change_v1() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_invalidate_national_association_memberships_on_club_change_v1
AFTER UPDATE OF deleted_at,is_ai,club_type,owner_user_id,country_code,is_active,inactivity_status
ON public.clubs
FOR EACH ROW
EXECUTE FUNCTION private.invalidate_national_association_memberships_on_club_change_v1();

-- Reconcile memberships made stale before the trigger was installed.
WITH invalid AS (
  SELECT m.id
  FROM public.national_association_memberships m
  JOIN public.clubs c ON c.id=m.club_id
  JOIN public.national_associations a ON a.id=m.association_id
  WHERE m.status='active'
    AND (c.deleted_at IS NOT NULL
         OR coalesce(c.is_ai,false)=true
         OR c.club_type IS DISTINCT FROM 'main'
         OR coalesce(c.is_active,true)=false
         OR coalesce(c.inactivity_status,'active')<>'active'
         OR m.user_id IS DISTINCT FROM c.owner_user_id
         OR upper(c.country_code) IS DISTINCT FROM upper(a.country_code))
)
UPDATE public.national_association_memberships m
SET status='ineligible',
    coach_eligible=false,
    left_on_game_date=coalesce(m.left_on_game_date,public.get_current_game_date_date()),
    updated_at=now()
FROM invalid i
WHERE m.id=i.id;

UPDATE public.national_coach_terms t
SET status='ineligible',
    term_end_game_date=greatest(t.term_start_game_date,public.get_current_game_date_date()),
    updated_at=now()
WHERE t.status='active'
  AND NOT private.national_association_member_is_eligible_v1(t.association_id,t.user_id);
