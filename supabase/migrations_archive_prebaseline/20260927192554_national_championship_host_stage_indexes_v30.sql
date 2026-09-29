create index if not exists national_championship_editions_qualification_source_stage_idx
  on public.national_championship_editions(qualification_source_stage_id)
  where qualification_source_stage_id is not null;

create index if not exists national_championship_editions_final_source_stage_idx
  on public.national_championship_editions(final_source_stage_id)
  where final_source_stage_id is not null;
