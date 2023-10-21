import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import upsertMatchData from "./upsertMatchData.js";
import schedulePolls from "./queue.js";
import { pollMatchInProgress, getSavedMatchesInProgress } from "./pollMatchInProgess.js";
import { getScore } from "./getScore.js";

/* 
[x] All competitions need to be upserted into the db
[x] All competitions that are after closes but not yet resulted or cancelled need to be polled w/ events endpt
	[x] Competitions in this category should be repeatedly polled until a result is ready
	[x] The db should be polled to find new competitions in this category
[x] All competitions that are resulted need to get scores pulled
*/

const options = {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
		detectSessionInUrl: false,
	},
};

const supabase = createClient(
	process.env.API_URL,
	process.env.SERVICE_ROLE_KEY,
	options
);

schedulePolls(supabase);