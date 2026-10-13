CREATE OR REPLACE FUNCTION public.queue_team_inactivity_emails_v1()
 RETURNS TABLE(queued_email_id uuid, club_id uuid, club_name text, email_type text, recipient_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_email_type text;
  v_subject text;
  v_body_text text;
  v_body_html text;
  v_email_id uuid;

  v_manager_name text;
  v_safe_manager_name text;
  v_safe_club_name text;

  v_home_url text := 'https://propelotonmanager.com';
  v_dashboard_url text := 'https://propelotonmanager.com/dashboard';
  v_brand_icon_url text := 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/5c3417dc-3924-4423-948a-745ae5902ed0.png';
begin
  for r in
    select
      c.id as club_id,
      c.name as club_name,
      c.owner_user_id as user_id,
      c.inactivity_status,
      c.inactivity_days_snapshot,
      c.inactivity_reason,
      p.email,
      p.username
    from public.clubs c
    join public.profiles p on p.id = c.owner_user_id
    where c.club_type = 'main'
      and coalesce(c.is_ai, false) = false
      and c.owner_user_id is not null
      and c.deleted_at is null
      and c.inactivity_status in (
        'at_risk',
        'inactive',
        'season_end_removal_pending'
      )
      and p.email is not null
      and trim(p.email) <> ''
      and p.email not ilike 'deleted_%@deleted.local'
  loop
    v_email_id := null;
    v_manager_name := coalesce(nullif(r.username, ''), 'manager');

    v_safe_manager_name := replace(replace(replace(replace(replace(
      v_manager_name,
      '&', '&amp;'
    ), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');

    v_safe_club_name := replace(replace(replace(replace(replace(
      r.club_name,
      '&', '&amp;'
    ), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');

    if r.inactivity_status = 'at_risk' then
      v_email_type := 'team_inactivity_warning_25_days';
      v_subject := 'Your ProPeloton Manager team is close to becoming inactive';

      v_body_text := format(
        'Hi %s,

Your team "%s" has had no manager activity for 25 days.

Your team is now marked as at risk, but nothing has been removed. Your team remains in the standings, races, results, and calendar.

If there is no activity after 30 days, your team will be marked inactive. If inactivity reaches 90 consecutive real days, your club becomes eligible for automatic removal from active competition and replacement by an existing AI club. Sign in before that threshold to keep your team.

To keep managing your team, simply log in and open your dashboard:

%s

ProPeloton Manager
%s',
        v_manager_name,
        r.club_name,
        v_dashboard_url,
        v_home_url
      );

    elsif r.inactivity_status = 'inactive' then
      v_email_type := 'team_inactive_30_days';
      v_subject := 'Your ProPeloton Manager team is now inactive';

      v_body_text := format(
        'Hi %s,

Your team "%s" has had no manager activity for 30 days and is now marked as inactive.

Your team has not been removed. It remains visible in standings, race history, results, and calendar. It is not being managed by AI.

You can return and reactivate your team by logging in again.

If inactivity reaches 90 consecutive real days, your club becomes eligible for automatic removal from active competition and replacement by an existing AI club. Sign in before that threshold to keep your team.

Open your dashboard:

%s

ProPeloton Manager
%s',
        v_manager_name,
        r.club_name,
        v_dashboard_url,
        v_home_url
      );

    elsif r.inactivity_status = 'season_end_removal_pending' then
      v_email_type := 'team_season_end_removal_pending_90_days';
      v_subject := 'Your ProPeloton Manager team reached 90 days of inactivity';

      v_body_text := format(
        'Hi %s,

Your team "%s" has had no manager activity for 90 days.

Your club has reached the 90-real-day inactivity threshold. It is due for automatic removal from active competition and replacement by an existing AI club following the safety checks. This no longer waits for season-end.

Your historical results and standings records are not deleted.

You can still return before season-end processing if you want to continue managing your team.

Open your dashboard:

%s

ProPeloton Manager
%s',
        v_manager_name,
        r.club_name,
        v_dashboard_url,
        v_home_url
      );
    end if;

    v_body_html := format(
      '<div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:640px">
        <p>Hi %s,</p>

        <p>%s</p>

        <p>%s</p>

        <p>%s</p>

        <p style="margin:24px 0">
          <a href="%s" style="display:inline-block;background:#facc15;color:#111827;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">
            Open dashboard
          </a>
        </p>

        <p style="color:#64748b;font-size:13px;margin-top:28px;margin-bottom:10px">
          <a href="%s" style="color:#64748b;text-decoration:none;font-weight:600">
            ProPeloton Manager
          </a>
        </p>

        <div style="margin-top:0">
          <a href="%s" style="display:inline-block;text-decoration:none">
            <img src="%s" alt="ProPeloton Manager" style="display:block;max-width:160px;height:auto;border:0" />
          </a>
        </div>
      </div>',
      v_safe_manager_name,

      case
        when r.inactivity_status = 'at_risk'
          then format('Your team <strong>%s</strong> has had no manager activity for 25 days.', v_safe_club_name)
        when r.inactivity_status = 'inactive'
          then format('Your team <strong>%s</strong> has had no manager activity for 30 days and is now marked as <strong>inactive</strong>.', v_safe_club_name)
        else
          format('Your team <strong>%s</strong> has had no manager activity for 90 days.', v_safe_club_name)
      end,

      case
        when r.inactivity_status = 'at_risk'
          then 'Your team is now marked as <strong>at risk</strong>, but nothing has been removed. Your team remains in the standings, races, results, and calendar.'
        when r.inactivity_status = 'inactive'
          then 'Your team has not been removed. It remains visible in standings, race history, results, and calendar. It is not being managed by AI.'
        else
          'Your club has reached the 90-real-day inactivity threshold. It is due for automatic removal from active competition and replacement by an existing AI club following the safety checks. This no longer waits for season-end.'
      end,

      case
        when r.inactivity_status = 'at_risk'
          then 'If there is no activity after 30 days, your team will be marked inactive. If inactivity reaches 90 consecutive real days, your club becomes eligible for automatic removal from active competition and replacement by an existing AI club. Sign in before that threshold to keep your team.'
        when r.inactivity_status = 'inactive'
          then 'You can return and reactivate your team by logging in again. If inactivity reaches 90 consecutive real days, your club becomes eligible for automatic removal from active competition and replacement by an existing AI club. Sign in before that threshold to keep your team.'
        else
          'Historical race results remain intact. If you returned recently, the removal processor verifies your latest activity before taking action.'
      end,

      v_dashboard_url,
      v_home_url,
      v_home_url,
      v_brand_icon_url
    );

    insert into public.game_email_queue (
      user_id,
      club_id,
      email_type,
      recipient_email,
      recipient_name,
      subject,
      body_text,
      body_html,
      metadata
    )
    values (
      r.user_id,
      r.club_id,
      v_email_type,
      r.email,
      r.username,
      v_subject,
      v_body_text,
      v_body_html,
      jsonb_build_object(
        'club_name', r.club_name,
        'inactivity_status', r.inactivity_status,
        'inactivity_days_snapshot', r.inactivity_days_snapshot,
        'inactivity_reason', r.inactivity_reason,
        'dashboard_url', v_dashboard_url,
        'home_url', v_home_url,
        'brand_icon_url', v_brand_icon_url,
        'queued_by', 'queue_team_inactivity_emails_v1'
      )
    )
    on conflict do nothing
    returning id into v_email_id;

    if v_email_id is not null then
      queued_email_id := v_email_id;
      club_id := r.club_id;
      club_name := r.club_name;
      email_type := v_email_type;
      recipient_email := r.email;
      return next;
    end if;
  end loop;
end;
$function$;
