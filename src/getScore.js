import { LambdaClient, GetFunctionCommand,UpdateFunctionConfigurationCommand, InvokeCommand } from "@aws-sdk/client-lambda";
export { getScore };

export default async function getScore({ team1, team2 }) {
	const search = `${team1} vs ${team2} score`;
	const query = encodeURIComponent(search.toLowerCase()).replace(/%20/g, "+");
	const lambdaResult = await invokeScoreLambda({
		query,
		names: [team1, team2],
	});
	if ('error' in lambdaResult) {
		console.log(`error calling lambda for ${team1} vs ${team2}`);
		return null;
	}
	const result = JSON.parse(lambdaResult?.result);
    return result?.outcomeList;
}

async function invokeScoreLambda(payload) {
    console.log('payload ', payload);
	const client = new LambdaClient({});
	const getConfigCommand = new GetFunctionCommand({FunctionName: 'scrapeScores'});
	const {MemorySize} = await client.send(getConfigCommand);
	const updateCommand = new UpdateFunctionConfigurationCommand({MemorySize:(MemorySize != 2048) ? 2048 : 2047, FunctionName: 'scrapeScores'});
	await client.send(updateCommand);
	const command = new InvokeCommand({
		FunctionName: "scrapeScores",
		Payload: JSON.stringify(payload),
	});

	const { Payload } = await client.send(command);
	const result = Buffer.from(Payload).toString();
	return { result };
}
