import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import upsertMatchData from "./upsertMatchData.js";
import { pollMatchInProgress, getSavedMatchesInProgress } from "./pollMatchInProgess.js";
import { getScore } from "./getScore.js";

/* 
[x] All competitions need to be upserted into the db
[] All competitions that are after closes but not yet resulted or cancelled need to be polled w/ events endpt
	[x] Competitions in this category should be repeatedly polled until a result is ready
	[x] The db should be polled to find new competitions in this category
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
	options
);

class Queue {
	constructor() {
		this.queue = [];
		this.set = new Set();
	}

	enqueue(value) {
		if (!this.set.has(value)) {
			this.queue.push(value);
			this.set.add(value);
		}
	}

	dequeue() {
		if (this.queue.length === 0) {
			return null; // or throw an error, or any other handling of empty queue
		}
		const value = this.queue.shift();
		this.set.delete(value);
		return value;
	}

	contains(value) {
		return this.set.has(value);
	}

	peek() {
		return this.queue.length > 0 ? this.queue[0] : null;
	}
}

getScore({team1: 'Liverpool', team2: 'Aston Vila'})
	.then(res => console.log(res));