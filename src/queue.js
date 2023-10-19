import { ToadScheduler, SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import upsertMatchData from './upsertMatchData.js';
import getScore from './scoreApi.js';
import { pollMatchInProgress, getSavedMatchesInProgress } from "./pollMatchInProgess.js";
/*
Three schedules:
	Api schedule: run top item from api queue (either 
		upsertMatchData or pollMatchInProgess)
	Scores schedule: attempt to pull a score for a resulted
		event every 20 minutes (each event is on its own schedule)
	Polling schedule: need to poll db occasionally

NEED TO HANDLE EVENT GETTING RESULTED FROM COMPETITIONS ENDPT: if an
	event somehow changes to resulted and that gets picked up from the
	competitions poll, that event will perpetually not have a score if
	the only way of starting the scores schedule is from the pollMatchInProgress
	call. Need to have a set of all events currently being polled for score and
	occasionally poll db for resulted events without score and push into that
	set

Need ways of checking that score isn't already being polled for when starting to poll for it
*/

const cloudbetQueue = new Queue();
const footballApiQueue = new Queue();



let counter = 0;

const scheduler = new ToadScheduler();

const task = new AsyncTask('test', asyncTest);

const job = new SimpleIntervalJob({ seconds: 5 }, task, { id: 'testId' });

scheduler.addSimpleIntervalJob(job);

async function asyncTest() {
	console.log('test');
	if (counter >= 5) {
		scheduler.removeById('testId');
	}
	counter++;
}

/*
Runs top item from cloudbet api queue
*/
async function runFromCloudbetQueue(supabase) {
	//needs queueItemId, eventId, currentStatus (also needs team1, team2 for queueing into football api queue)
	const queueItem = cloudbetQueue.dequeue();
	switch (queueItem.queueItemId) {
		//hit competitions endpoint and update db, pull competitions in progress out of db
		case "DB":
			//update db with data from competitions endpt (don't think matches in progress will be updated here), then pull all matches in progress into queue
			upsertMatchData(supabase)
				.then(() => queueMatchesInProgress(supabase));
			cloudbetQueue.enqueue({ queueItemId: "DB" });
			break;
		//if for some reason the comp item isn't in the queue, add it
		case null:
			cloudbetQueue.enqueue({ queueItemId: "DB" });
			break;
		//event id of individual event
		default:
			pollMatchInProgressAndHandleResult(supabase, queueItem);
	}
}

async function pollMatchInProgressAndHandleResult(supabase, item) {
	const pollResult = await pollMatchInProgress(item);
	//status is the same
	if (pollResult == null) {
		cloudbetQueue.enqueue(item);
		return;
	}
	//status has changed, need to update db and possibly begin polling for score
	const { data, error } = await supabase
		.from('matches')
		.update({ status: pollResult })
		.eq('id', item.eventId)
	if (error) {
		console.log('supabase error in pollMatchAndHandleResult: ', error);
		cloudbetQueue.enqueue(item);
		return;
	}
	//do we actually want to enqueue items that aren't resulted but are done?
	if (pollResult !== 'RESULTED') {
		cloudbetQueue.enqueue(item);
		return;
	}
	footballApiQueue.enqueue(item);
}

//need to get all matches from db which do not have a status signifying resulted and have a 'closes' time before the current time
async function queueMatchesInProgress(supabase) {
	const { data, error } = supabase
		.from('matches')
		.select('id, team1, team2')
		.lte('closes', Date.now())
		.nin('status', ['RESULTED', 'CANCELLED']);
	if (error) {
		console.log('supabase error in queueMatchesInProgress: ', error, '. Nothing queued');
		return;
	}
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
	//needs to have queueItemId, team1, team2, eventId
	const queueItem = footballApiQueue.dequeue();
	switch (queueItem?.queueItemId) {
		case 'ENQUEUE':
			queueUnscoredGames(supabase);
			footballApiQueue.enqueue(queueItem);
			break;
		//queueItem isn't null, score needs to be polled
		case undefined:
			footballApiQueue.enqueue({queueItemId: 'ENQUEUE'});
			break;
		default:
			const score = await getScore(queueItem);
			if (score) {
				const { data, error } = supabase
					.from('matches')
					.update({
						team1_score: scoreObj['team1'],
						team2_score: scoreObj['team2'],
					})
					.eq('id', queueItem.eventId)
			}
			else {
				//possibly have this in a catch
				footballApiQueue.enqueue(queueItem);
			}
	}

}

//find all RESULTED games in db without score, queue them into football api queue (remember to include queueItemId)
async function queueUnscoredGames(supabase) {
	const { data, error } = supabase
		.from('matches')
		.select('id, team1, team2')
		.eq('status', 'RESULTED')
		.or('team1_score.is.null,team2_score.is.null');
	if (error) {
		console.log('supabase error in queueUnscoredGames: ', error, '. Nothing queued');
		return;
	}
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

/*
Queue which only takes 1 of any individual item id where item
	id is either the event id of the event to be polled or "COMP"
	if the entire competitions endpoint is to be polled
*/
class Queue {
	constructor() {
		this.queue = []; //queue of items
		this.set = new Set(); //set of queueItemIds
	}

	enqueue(value) {
		if (!("queueItemId" in value)) {
			return;
		}
		if (!this.set.has(value.queueItemId)) {
			this.queue.push(value);
			this.set.add(value.queueItemId);
		}
	}

	dequeue() {
		if (this.queue.length === 0) {
			return null; // or throw an error, or any other handling of empty queue
		}
		const value = this.queue.shift();
		this.set.delete(value.queueItemId);
		return value;
	}

	contains(value) {
		return this.set.has(value);
	}

	peek() {
		return this.queue.length > 0 ? this.queue[0] : null;
	}
}