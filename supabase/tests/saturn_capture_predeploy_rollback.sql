-- Schema-only targeted recovery capture. Run under the database owner.
-- No real function bodies, user data, secrets or configuration are exported
-- to the public repository. This is an in-database rollback aid, not a
-- substitute for Supabase physical backups. First install ONLY, gates OFF.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
create table if not exists private.saturn_predeploy_schema_backup_v1 (
  release_key text primary key,
  captured_at timestamptz not null default clock_timestamp(),
  payload jsonb not null,
  payload_md5 text not null
);
alter table private.saturn_predeploy_schema_backup_v1 enable row level security;
revoke all on table private.saturn_predeploy_schema_backup_v1 from PUBLIC,anon,authenticated,service_role;
do $capture$
declare
  v_release constant text := 'saturn-20261121-02579b8';
  v_names text[] := array[
    'get_admin_analytics_dashboard_v1',
    'ppm_reject_guest_owned_clubs_v1',
    'trg_assign_new_real_club_to_ai_slot',
    'apply_for_race_v1',
    'cancel_race_application_v1',
    'clear_rider_daily_training_override_v1',
    'hire_staff_candidate',
    'save_training_camp_day_training_plans',
    'set_regular_training_coach_automation_v1',
    'set_rider_daily_training_override_v1',
    'set_rider_regular_training_management_v1',
    'equipment_discard_item',
    'equipment_purchase_item',
    'equipment_purchase_race_supplies',
    'equipment_save_auto_restock_rule_v1',
    'equipment_save_default_setup',
    'equipment_save_setup_preset',
    'accept_rider_transfer_offer',
    'cancel_rider_transfer_listing',
    'cancel_training_camp_booking',
    'confirm_unsolicited_ai_transfer_bid_v1',
    'extend_club_staff_contract',
    'finance_book_training_camp',
    'finance_book_training_camp_v2',
    'finance_issue_emergency_loan',
    'purchase_race_replay_access_v1',
    'release_club_staff',
    'release_owned_rider',
    'release_rider_to_free_agents',
    'sell_infrastructure_asset',
    'upgrade_club_facility',
    'trg_rebalance_top3_overflow_ai_to_pool_v1',
    'finance_grant_new_club_bonus',
    'finance_setup_new_club',
    'finance_credit_to_club',
    'finance_get_or_create_club_account',
    'finance_apply_club_house_tax_rebate_v1',
    'finance_charge_emergency_loan_weekly_payment',
    'finance_charge_race_cost',
    'finance_create_club_house_rebate_v1',
    'finance_force_transfer_club_to_club',
    'finance_issue_emergency_loan_non_ai_core_v1',
    'finance_run_monthly_tax_audit_for_club',
    'race_engine_refund_one_day_weather_cancelled_race_v1',
    'refund_one_day_weather_cancelled_race_v2',
    'finance_spend_from_club',
    'finance_spend_from_club_non_ai_core_v1',
    'finance_liquidate_club_for_insolvency',
    'finance_liquidate_club_for_insolvency_non_ai_core_v1',
    'finance_ensure_mandatory_funds',
    'finance_ensure_mandatory_funds_non_ai_core_v1',
    'finance_process_weekly_emergency_loan_repayments',
    'finance_run_due_monthly_tax_audits',
    'equipment_save_default_setup_types',
    'equipment_save_maintenance_reminder_v1',
    'equipment_sell_item',
    'equipment_start_maintenance',
    'equipment_unlock_setup_slot_v1',
    'decline_my_youth_race_invitation_v1',
    'enter_my_youth_race_v1',
    'run_my_youth_scouting_search_v2',
    'save_my_youth_race_lineup_v1',
    'transfer_my_youth_academy_budget_v1',
    'update_my_youth_training_philosophy_v1',
    'user_has_youth_academy_access_v1',
    'apply_competition_rewards_v1',
    'grant_referral_paid_conversion_reward_v1',
    'grant_welcome_coins_for_new_profile',
    'process_birthday_gifts_v1',
    'referral_record_activity_day_v1',
    'sponsor_prepare_main_offer_deal_metadata_v1',
    'sponsor_set_objective_target_v1',
    'sponsor_sign_offer',
    'update_club_branding_v1',
    'transfer_add_rider_to_shortlist_v2',
    'transfer_add_shortlist_target_v1',
    'transfer_delete_saved_search_v1',
    'transfer_remove_rider_from_shortlist_v2',
    'transfer_save_market_search_v1',
    'reject_rider_transfer_offer',
    'submit_contract_renewal_offer',
    'withdraw_rider_transfer_offer',
    'submit_unsolicited_ai_transfer_bid_v1'
  ];
  v_tables text[] := array[
    'clubs',
    'club_memberships',
    'club_equipment_inventory',
    'club_finance_summary',
    'club_infrastructure',
    'club_staff',
    'race_team_entries',
    'rider_regular_training_daily_plans',
    'rider_regular_training_management',
    'rider_transfer_listings',
    'rider_transfer_offers',
    'rider_transfer_negotiations',
    'rider_unsolicited_transfer_bids',
    'training_camp_bookings',
    'rider_contracts',
    'club_riders',
    'club_team_cars',
    'club_team_buses',
    'club_equipment_vans',
    'riders',
    'club_roster',
    'user_coin_ledger',
    'user_wallets',
    'youth_academies'
  ];
  v_payload jsonb;
begin
  if current_user <> 'postgres' then raise exception 'Requires database owner'; end if;
  if coalesce((select enabled from private.ppm_guest_auth_gate_v1 where id=true),true)
     or exists(select 1 from auth.users where is_anonymous is true)
     or to_regclass('public.saturn_test_accounts_v1') is not null
     or to_regclass('private.saturn_test_club_rollout_v1') is not null
     or exists(select 1 from pg_policies where schemaname='public' and policyname like 'saturn_trial_%')
     or exists(select 1 from pg_trigger where not tgisinternal and tgname like 'saturn_%')
  then raise exception 'Expected untouched pre-Saturn state with signup closed'; end if;
  if exists(select 1 from unnest(v_names) as t(name)
    where (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=t.name)<>1)
  then raise exception 'Missing or overloaded baseline routine'; end if;
  if (select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any(v_tables))<>cardinality(v_tables)
  then raise exception 'Missing baseline relation'; end if;
  select jsonb_build_object(
    'release',v_release,
    'functions',(select jsonb_agg(jsonb_build_object(
      'name',p.proname,'signature',format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)),
      'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid),
      'acl',coalesce((select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
        order by a.grantee,a.grantor,a.privilege_type)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb))
      order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=any(v_names)),
    'relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,
      'force_rls',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text,
      'view_definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end)
      order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any(v_tables)),
    'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname),'[]'::jsonb)
      from pg_policies p where p.schemaname='public' and p.tablename=any(v_tables)),
    'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,
      'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) order by c.relname,t.tgname),'[]'::jsonb)
      from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::regnamespace and c.relname=any(v_tables) and not t.tgisinternal),
    'auth_gate',(select jsonb_build_object('enabled',enabled,'verified_at',verified_at)
      from private.ppm_guest_auth_gate_v1 where id=true)
  ) into v_payload;
  insert into private.saturn_predeploy_schema_backup_v1(release_key,payload,payload_md5)
  values(v_release,v_payload,md5(v_payload::text));
end;
$capture$;
commit;
-- Return only inventory counts, never the captured source or ACL values.
select release_key,captured_at,jsonb_array_length(payload->'functions') as routines,
 jsonb_array_length(payload->'relations') as relations,jsonb_array_length(payload->'policies') as policies,
 jsonb_array_length(payload->'triggers') as triggers,payload_md5=md5(payload::text) as checksum_ok
from private.saturn_predeploy_schema_backup_v1 where release_key='saturn-20261121-02579b8';
