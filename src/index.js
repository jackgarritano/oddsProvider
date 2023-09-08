import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import upsertMatchData from "./upsertMatchData.js";

/* 
[x] All competitions need to be upserted into the db
[] All competitions that are after closes but not yet resulted or cancelled need to be polled w/ events endpt
[] All competitions that are resulted need to get scores pulled
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
	options,
);

upsertMatchData(supabase);