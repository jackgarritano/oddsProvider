import { ToadScheduler, SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import upsertMatchData from "./upsertMatchData";
import {
	pollMatchInProgress,
	getSavedMatchesInProgress,
} from "./pollMatchInProgess.js";
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
*/

/*
Runs top item from api queue
*/
async function runFromQueue(queue) {
	const queueItem = queue.dequeue();
	switch (queueItem.id) {
		case "COMP":
			upsertMatchData();
			queue.enqueue({ id: "COMP" });
			break;
		case null:
			queue.enqueue({ id: "COMP" });
			break;
		default:
	}
}

//TODO
async function pollMatchInProgressAndHandleResult(supabase, queue, item) {
	const pollResult = await pollMatchInProgress(item);
	if (pollResult != null) {
		const { error, data } = supabase
			.select()
			.from("matches")
			.insert({ id: item.id, status: pollResult });
		if ((pollResult = "RESULTED")) {
			//TODO: kick off score polling
		}
	} else {
        queue.enqueue(item);
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
