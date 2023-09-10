export {pollMatchInProgress, getSavedMatchesInProgress};
/*
Matches for which betting has closed but are not yet resulted or cancelled
need to be polled for when they become completed (or cancelled), which
signals when scores might need to be scraped. Because the competitions
endpoint seems to not include matches for which betting has closed, these
matches need to be polled via the events endpoint on a per-match basis
*/


/*
Wrapper for the fetch function which checks if the status
has changed
*/
async function pollMatchInProgress({ eventId, currentStatus }) {
	const matchData = await fetchFromEventsEndpt(eventId);
	if (matchData.status != currentStatus) {
		return matchData.status;
	}
	return null;
}

/*
Calls the cloudbet events endpoint
*/
async function fetchFromEventsEndpt(eventId) {
	const data = await fetch(
		`https://sports-api.cloudbet.com/pub/v2/odds/events/${eventId}?markets=soccer.match_odds`,
		{
			headers: {
				accept: "application/json",
				"X-API-Key": process.env.CLOUDBET_KEY,
			},
		}
	);
	const parsedData = await data.json();
	return parsedData;
}

/*
Queries the db for matches in progress
*/
async function getSavedMatchesInProgress(supabase) {
	const { data, error } = await supabase
		.from("matches")
		.select("id", "status", "team1", "team2")
		.neq("status", "RESULTED")
		.neq("status", "CANCELLED")
		.lt("closes", Date.now());
        
	return data;
}
