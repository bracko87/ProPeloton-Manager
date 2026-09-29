
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_net with schema public;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

do $$ begin
  create type public.club_tier as enum ('worldteam','proteam','continental','amateur');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.rider_contract_status as enum ('active','expired','released','breached','terminated');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.rider_negotiation_status as enum ('open','accepted','rejected','withdrawn','expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.rider_payroll_status as enum ('active','released_unpaid','settled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.rider_role as enum ('Leader','Sprinter','Climber','TT','Domestique','Breakaway','All-rounder');
exception when duplicate_object then null; end $$;
