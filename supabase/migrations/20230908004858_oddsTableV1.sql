create table "public"."matches" (
    "id" text not null,
    "status" text not null,
    "team1" text not null,
    "team2" text not null,
    "draw_price" real not null,
    "team1_price" real not null,
    "team1_score" smallint,
    "team2_price" real not null,
    "team2_score" smallint,
    "closes" bigint not null
);


alter table "public"."matches" enable row level security;

CREATE UNIQUE INDEX matches_pkey ON public.matches USING btree (id);

alter table "public"."matches" add constraint "matches_pkey" PRIMARY KEY using index "matches_pkey";