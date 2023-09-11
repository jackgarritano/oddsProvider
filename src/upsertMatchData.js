const NOT_NULL_FIELDS = [
    "id",
    "status",
    "team1",
    "team2",
    "draw_price",
    "team1_price",
    "team2_price",
    "closes",
];

/*
Upserts all active matches into db
*/
export default async function upsertMatchData(supabase) {
	const rawMatchData = await fetchFromCompetitionsEndpt();
	const organizedMatchData = await organizeCompetitionsData(rawMatchData);

	const { data, error } = await supabase
		.from("matches")
		.upsert(organizedMatchData)
		.select();
}

/*
Returns the raw data from the cloudbet api competitions endpoint. This data should
represent currently active competitions
*/
async function fetchFromCompetitionsEndpt() {
	const data = await fetch(
		"https://sports-api.cloudbet.com/pub/v2/odds/competitions/soccer-england-premier-league?markets=soccer.match_odds",
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
Returns an array of matches formatted correctly to be included in the db
*/
function organizeCompetitionsData(data) {
	const eventsList = data.events;
	const matchesList = eventsList.filter((el) => {
		const marketsObj = el.markets;
		return Object.keys(marketsObj).length != 0; //competitions that aren't matches still show up but will always show as having no markets
	});
	const formattedMatchesList = matchesList.map((el) => mapToSchema(el));
	const formattedMatchesListNoNull = formattedMatchesList.filter((el) =>
		matchObeysNullRules(el)
	); //transaction will fail if unallowed nulls are present
	console.log("matchlistnonull ", formattedMatchesListNoNull);
	return formattedMatchesListNoNull;
}

/*
Fields where null isn't allowed must not have null or transaction will fail
*/
function matchObeysNullRules(matchObj) {
	for (let ind in NOT_NULL_FIELDS) {
		const fieldName = NOT_NULL_FIELDS[ind];
		if (
			matchObj[fieldName] == null ||
			matchObj[fieldName] == undefined ||
			matchObj[fieldName] == NaN ||
			matchObj[fieldName] == ""
		) {
			return false;
		}
	}
	return true;
}

/* 
Reformat a match sent from the Cloudbet api to the database schema
*/
function mapToSchema(matchObj) {
	const { team1_price, team2_price, draw_price } = (() => {
		try {
			const selectionsArray =
				matchObj.markets["soccer.match_odds"].submarkets["period=ft"]
					.selections;
			const oddsObj = {};
			for (let ind in selectionsArray) {
				const el = selectionsArray[ind];
				switch (el.outcome) {
					case "home":
						oddsObj["team1_price"] = el.price;
						break;
					case "away":
						oddsObj["team2_price"] = el.price;
						break;
					case "draw":
						oddsObj["draw_price"] = el.price;
						break;
				}
			}
			return oddsObj;
		} catch (e) {
			console.log(e);
			return {
				team1_price: undefined,
				team2_price: undefined,
				draw_price: undefined,
			};
		}
	})();

	const closesDate = new Date(matchObj.cutoffTime);
	const closes = closesDate.getTime();

	return {
		id: matchObj?.id,
		status: matchObj?.status,
		team1: matchObj?.home?.name,
		team2: matchObj?.away?.name,
		team1_price,
		team2_price,
		draw_price,
		closes,
	};
}