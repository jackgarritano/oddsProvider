import { ToadScheduler, SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import upsertMatchData from './upsertMatchData.js';
import getScore from './scoreApi.js';
import { pollMatchInProgress, getSavedMatchesInProgress } from "./pollMatchInProgess.js";
import log from './logger.js';
import UniqueQueue from './uniqueQueue.js';

/*
Two queues:
	Cloudbet queue: every 10 seconds, either updates upcoming matches
		in db and then enqueues matches in progress, or polls a match
		in progress to see if it has finished
	Scores schedule: every 20 seconds, either enqueues resulted matches
		from db or polls a resulted match for score
*/

// let counter = 0;

// const scheduler = new ToadScheduler();

// const task = new AsyncTask('test', asyncTest);

// const job = new SimpleIntervalJob({ seconds: 5 }, task, { id: 'testId' });

// scheduler.addSimpleIntervalJob(job);

// async function asyncTest() {
// 	console.log('test');
// 	if (counter >= 5) {
// 		scheduler.removeById('testId');
// 	}
// 	counter++;
// }

const cloudbetQueue = new UniqueQueue();
const footballApiQueue = new UniqueQueue();

//start the scheudules that repeatedly run cloudbet and football api queues
export default function schedulePolls(supabase){
	const scheduler = new ToadScheduler();
	scheduleCloudbet(scheduler, supabase);
	scheduleScore(scheduler, supabase);
}

function scheduleCloudbet(scheduler, supabase){
	log.info('running scheduleCloudbet');
	//should the lambda be async?
	const cloudbetTask = new AsyncTask('cloudbetQueue', async () => runFromCloudbetQueue(supabase));
	const cloudbetJob = new SimpleIntervalJob({seconds: 10}, cloudbetTask);
	scheduler.addSimpleIntervalJob(cloudbetJob);
}

function scheduleScore(scheduler, supabase){
	log.info('running scheduleScore');
	//should the lambda be async?
	const scoreTask = new AsyncTask('footballApiQueue', async () => runFromFootballApiQueue(supabase));
	const scoreJob = new SimpleIntervalJob({seconds: 20}, scoreTask);
	scheduler.addSimpleIntervalJob(scoreJob);
}

// Runs top item from cloudbet api queue
async function runFromCloudbetQueue(supabase) {
	log.info('running runFromCloudbetQueue');
	//needs queueItemId, eventId, currentStatus (also needs team1, team2 for queueing into football api queue)
	const queueItem = cloudbetQueue.dequeue();
	switch (queueItem?.queueItemId) {
		//hit competitions endpoint and update db, pull competitions in progress out of db
		case "DB":
			log.info('queueItemId is DB');
			//update db with data from competitions endpt (don't think matches in progress will be updated here), then pull all matches in progress into queue
			upsertMatchData(supabase)
				.then(() => queueMatchesInProgress(supabase));
			cloudbetQueue.enqueue({ queueItemId: "DB" });
			break;
		//if for some reason the comp item isn't in the queue, add it
		case undefined:
			log.info('queueItemId is undefined');
			cloudbetQueue.enqueue({ queueItemId: "DB" });
			break;
		//event id of individual event
		default:
			log.info('queueItemId is ', queueItem.queueitemId);
			pollMatchInProgressAndHandleResult(supabase, queueItem);
	}
}

async function pollMatchInProgressAndHandleResult(supabase, item) {
	log.info('running pollMatchInProgressAndHandleResult');
	const pollResult = await pollMatchInProgress(item);
	//status is the same
	if (pollResult == null) {
		log.info('result was null');
		cloudbetQueue.enqueue(item);
		return;
	}
	//status has changed, need to update db and possibly begin polling for score
	const { data, error } = await supabase
		.from('matches')
		.update({ status: pollResult })
		.eq('id', item.eventId)
	if (error) {
		log.error('supabase error in pollMatchAndHandleResult: ', error);
		cloudbetQueue.enqueue(item);
		return;
	}
	log.info('db was updated to status ', pollResult);
	item['currentStatus'] = pollResult;
	switch(pollResult){
		//if event is closed but no payout is needed, no further polling is needed
		case 'CANCELLED':
			log.info('status was cancelled');
			break;
		//if event is resulted, need to get the score
		case 'RESULTED':
			log.info('status was resulted');
			footballApiQueue.enqueue(item);
			break;
		//if event is not cancelled and not resulted, it has not reached a final status. Keep polling until it does
		default:
			log.info(`status was't cancelled or resulted`);
			cloudbetQueue.enqueue(item);
	}
}

//need to get all matches from db which do not have a status signifying resulted and have a 'closes' time before the current time
async function queueMatchesInProgress(supabase) {
	log.info('running queueMatchesInProgress');
	const { data, error } = await supabase
		.from('matches')
		.select('id, team1, team2')
		.lte('closes', Date.now())
		.not('status', 'in', `(RESULTED, CANCELLED)`);
	if (error) {
		log.error('supabase error in queueMatchesInProgress: ', error, '. Nothing queued');
		return;
	}
	log.info('matches in progress pulled from db');
	log.info('data type: ', typeof data);
	log.info('data: ', data);
	for (const inProgressMatch of data) {
		cloudbetQueue.enqueue(
			{
				queueItemId: inProgressMatch.id,
				team1: inProgressMatch.team1,
				team2: inProgressMatch.team2,
				eventId: inProgressMatch.id,
				currentStatus: inProgressMatch.status,
			}
		);
	}
}

//runs top item from football api queue
async function runFromFootballApiQueue(supabase) {
	log.info('running runFromFootballApiQueue');
	//needs to have queueItemId, team1, team2, eventId
	const queueItem = footballApiQueue.dequeue();
	switch (queueItem?.queueItemId) {
		case 'ENQUEUE':
			log.info('queueItemId was ENQUEUE');
			queueUnscoredGames(supabase);
			footballApiQueue.enqueue(queueItem);
			break;
		//queueItem isn't null, score needs to be polled
		case undefined:
			log.info('queueItemId was undefined');
			footballApiQueue.enqueue({queueItemId: 'ENQUEUE'});
			break;
		default:
			log.info('queueItemId was ', queueItem?.queueitemId);
			const score = await getScore(queueItem);
			if (score) {
				log.info('returned score was ', score);
				const { data, error } = await supabase
					.from('matches')
					.update({
						team1_score: scoreObj['team1'],
						team2_score: scoreObj['team2'],
					})
					.eq('id', queueItem.eventId)
			}
			else {
				log.info('no score returned');
				//possibly have this in a catch
				footballApiQueue.enqueue(queueItem);
			}
	}

}

//find all RESULTED games in db without score, queue them into football api queue (remember to include queueItemId)
async function queueUnscoredGames(supabase) {
	log.info('running queueUnscoredGames');
	const { data, error } = await supabase
		.from('matches')
		.select('id, team1, team2')
		.eq('status', 'RESULTED')
		.or('team1_score.is.null,team2_score.is.null');
	if (error) {
		log.error('supabase error in queueUnscoredGames: ', error, '. Nothing queued');
		return;
	}
	log.info('unscored games pulled from db');
	for (const unscoredMatch of data) {
		footballApiQueue.enqueue(
			{
				queueItemId: unscoredMatch.id,
				team1: unscoredMatch.team1,
				team2: unscoredMatch.team2,
				eventId: unscoredMatch.id,
			}
		);
	}
}