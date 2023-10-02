import "dotenv/config";

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
	console.log('lookup table ', lookupTable);
}

generateLookupTable();