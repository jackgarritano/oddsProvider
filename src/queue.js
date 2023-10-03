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

const job = new SimpleIntervalJob({seconds: 5}, task, {id: 'testId'});

scheduler.addSimpleIntervalJob(job);

async function asyncTest(){
	console.log('test');
	if(counter >= 5){
		scheduler.removeById('testId');
	}
	counter++;
}

/*
Runs top item from api queue
*/
async function runFromCloudbetQueue(supabase){
    const queueItem = cloudbetQueue.dequeue();
    switch(queueItem.id){
        case "COMP":
            upsertMatchData();
            cloudbetQueue.enqueue({id: "COMP"});
            break;
        case null:
            cloudbetQueue.enqueue({id: "COMP"});
            break;
		//event id of individual event
        default:

    }
}

async function runFromFootballApiQueue(supabase){
	//needs to have team1, team2, id
	const queueItem = footballApiQueue.dequeue();
	if(queueItem){
		const score = await getScore(queueItem);
		if(score){
			const {data, error} = supabase
				.from('matches')
				.update({
					team1_score: scoreObj['team1'],
					team2_score: scoreObj['team2'],
				})
				.eq('id', item.eventId)
		}
		else{
			//possibly have this in a catch
			footballApiQueue.enqueue(queueItem);
		}
	}
}

async function pollMatchInProgressAndHandleResult(supabase, item){
    const pollResult = await pollMatchInProgress(item);
	//status is the same
    if(pollResult == null){
		cloudbetQueue.enqueue(item);
		return;
	}
	//status has changed, need to update db and possibly begin polling for score
	const {data, error} = await supabase
		.from('matches')
		.update({status: pollResult})
		.eq('id', item.eventId)
	if(error){
		console.log('supabase error in pollMatchAndHandleResult: ', error);
		cloudbetQueue.enqueue(item);
		return;
	}
	if(pollResult !== 'RESULTED'){
		cloudbetQueue.enqueue(item);
		return;
	}
	footballApiQueue.enqueue(item);
}

/*
Queue which only takes 1 of any individual item id where item
    id is either the event id of the event to be polled or "COMP"
    if the entire competitions endpoint is to be polled
*/
class Queue {
	constructor() {
		this.queue = []; //queue of items
		this.set = new Set(); //set of item ids
	}

	enqueue(value) {
		if (!("id" in value)) {
			return;
		}
		if (!this.set.has(value.id)) {
			this.queue.push(value);
			this.set.add(value.id);
		}
	}

	dequeue() {
		if (this.queue.length === 0) {
			return null; // or throw an error, or any other handling of empty queue
		}
		const value = this.queue.shift();
		this.set.delete(value.id);
		return value;
	}

	contains(value) {
		return this.set.has(value);
	}

	peek() {
		return this.queue.length > 0 ? this.queue[0] : null;
	}
}
