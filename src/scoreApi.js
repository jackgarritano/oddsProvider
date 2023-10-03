import "dotenv/config";
import stringSimilarity from "string-similarity";

export default async function getScore({ team1, team2 }) {
	//find team1's id in the football api using the lookup table
	const lookupTable = await generateLookupTable();
	let maxSimilarity = 0;
	let team1Id = null;
	for(const teamName of Object.keys(lookupTable)){
		const similarity = compareTwoDice(team1, teamName);
		if(similarity > maxSimilarity){
			maxSimilarity = similarity;
			team1Id = lookupTable[teamName];
		}
	}

	//find the correct recent match
	const team1RecentMatches = await getRecentMatches(team1Id);
	let correctMatch = null;
	maxSimilarity = 0;
	for(const match of team1RecentMatches){
		if(match.homeTeam.id !== team1Id){
			const similarity = compareTwoDice(team2, match.homeTeam.name);
			if(similarity > maxSimilarity){
				correctMatch = match;
			}
		}
		else{
			const similarity = compareTwoDice(team2, match.awayTeam.name);
			if(similarity > maxSimilarity){
				correctMatch = match;
			}
		}
	}

	const score = {};
	if(correctMatch.status !== 'FINISHED'){
		return null;
	}
	if(correctMatch.homeTeam.id === team1Id){
		score['team1'] = correctMatch.score.fullTime.home;
		score['team2'] = correctMatch.score.fullTime.away;
	}
	else{
		score['team1'] = correctMatch.score.fullTime.away;
		score['team2'] = correctMatch.score.fullTime.home;
	}
	return score;
}

async function generateLookupTable(){
	const lookupTable = {};
	const unparsedData = await fetch('https://api.football-data.org/v4/competitions/PL/teams', {
		headers: {
			'X-Auth-Token': process.env.FOOTBALL_API_TOKEN,
		},
	});
	const parsedData = await unparsedData.json();
	for(const team of parsedData.teams){
		lookupTable[team.name] = team.id;
	}
	return lookupTable;
}

async function getRecentMatches(teamId){
	const today = new Date();
	const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
	const weekAhead = new Date(today + 7 * 24 * 60 * 60 * 1000);
	const unparsedData = await fetch(`https://api.football-data.org/v4/teams/${teamId}/matches?limit=5&dateFrom=${formatDate(weekAgo)}&dateTo=${formatDate(weekAhead)}`, {
		headers: {
			'X-Auth-Token': process.env.FOOTBALL_API_TOKEN,
		},
	});
	const parsedData = await unparsedData.json();
	return parsedData.matches;
}

function formatDate(date){
	return date.toISOString().slice(0, 10);
}

function compareTwoDice(str1, str2) {
	//normalize the strings
	str1 = str1.toLowerCase();
	str1 = str1.replace(/[^a-zA-Z0-9 ]/g, "");
	str2 = str2.toLowerCase();
	str2 = str2.replace(/[^a-zA-Z0-9 ]/g, "");
	const score = stringSimilarity.compareTwoStrings(str1, str2);
	//console.log(`dice: ${str1} vs ${str2}: ${score}`);
	return score;
}