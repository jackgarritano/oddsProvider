create table "public"."matches" (
    "id" uuid not null,
    "status" text,
    "team1" text,
    "team2" text,
    "team1odds" real,
    "team2odds" real,
    "drawodds" real,
    "closes" timestamp with time zone
);


alter table "public"."matches" enable row level security;

CREATE UNIQUE INDEX matches_pkey ON public.matches USING btree (id);

alter table "public"."matches" add constraint "matches_pkey" PRIMARY KEY using index "matches_pkey";



