/*
Queue which only takes 1 of any individual item id where item
	id is either the event id of the event to be polled or "COMP"
	if the entire competitions endpoint is to be polled
*/
class UniqueQueue {
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

export default UniqueQueue;