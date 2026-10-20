-- Partial answers, and CNY amounts that must not be stored as USD.
-- Fresh installs already have these columns from the init migration.

alter table messages add column if not exists estimated_cost_cny numeric(14, 8) not null default 0;
alter table messages add column if not exists unpriced_models jsonb not null default '[]'::jsonb;
alter table messages add column if not exists unverified_models jsonb not null default '[]'::jsonb;
alter table messages add column if not exists partial boolean not null default false;

alter table usage_events add column if not exists estimated_cost_cny numeric(14, 8) not null default 0;
