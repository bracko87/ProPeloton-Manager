-- Keep National Championship rider commitments consistent with participation decisions.
-- Any rejected/withdrawn entry must release its confirmed duty immediately,
-- regardless of which lifecycle path changed the entry.

create or replace function public.reconcile_national_championship_entry_duty_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Initial rejection/withdrawal invalidates every still-confirmed Championship
  -- commitment for this rider in this edition.
  if new.entry_status = 'withdrawn'
     or new.participation_decision not in ('approved','auto_approved')
  then
    update public.national_championship_duties
    set status = 'cancelled',
        updated_at = now()
    where edition_id = new.edition_id
      and rider_id = new.rider_id
      and status = 'confirmed';

  -- A second-stage Final rejection only releases the Final commitment. The
  -- qualification duty may already be historical and is left untouched.
  elsif new.entry_path = 'qualification'
        and new.final_participation_decision = 'rejected'
  then
    update public.national_championship_duties
    set status = 'cancelled',
        updated_at = now()
    where edition_id = new.edition_id
      and rider_id = new.rider_id
      and duty_type = 'final'
      and status = 'confirmed';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_reconcile_national_championship_entry_duty_v1
on public.national_championship_entries;

create trigger trg_reconcile_national_championship_entry_duty_v1
after insert or update of
  entry_status,
  participation_decision,
  final_participation_decision
on public.national_championship_entries
for each row
execute function public.reconcile_national_championship_entry_duty_v1();

-- Repair stale commitments already present before this invariant was installed.
update public.national_championship_duties d
set status = 'cancelled',
    updated_at = now()
from public.national_championship_entries en
where d.edition_id = en.edition_id
  and d.rider_id = en.rider_id
  and d.status = 'confirmed'
  and (
    en.entry_status = 'withdrawn'
    or en.participation_decision not in ('approved','auto_approved')
    or (
      d.duty_type = 'final'
      and en.entry_path = 'qualification'
      and en.final_participation_decision = 'rejected'
    )
  );

comment on function public.reconcile_national_championship_entry_duty_v1()
is 'Invariant guard: rejected or withdrawn National Championship entries cannot retain confirmed rider duties.';
