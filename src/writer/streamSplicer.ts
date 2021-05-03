import {
	Readable,
} from "stream";

export interface SpliceEntry {
	size: number;
	stream: Readable | Buffer;
}

export class StreamSplicer extends Readable {
	spliceList: SpliceEntry[];
	currentIndex: number = 0;
	bytesRead: number = 0;
	constructor(spliceList: SpliceEntry[]) {
		super();
		this.spliceList = spliceList;
	}

	async _read(size: number) {
		let reading = true;
		while(reading) {
			// Check if we need to switch or if we made a mistake
			const currentPiece = this.spliceList[this.currentIndex];
			if(!currentPiece) return this.push(null);
			const toRead = currentPiece.size - this.bytesRead;
			if(toRead === 0) {
				this.currentIndex++;
				this.bytesRead = 0;
				continue;
			} else if(toRead < 0) throw new Error("StreamSplicer pushed too much data");

			// Keep reading
			if(Buffer.isBuffer(currentPiece.stream)) {
				reading = this.push(currentPiece.stream.slice(0, currentPiece.size));
				this.bytesRead = currentPiece.size;
			} else {
				let data: Buffer | string | null = currentPiece.stream.read(Math.min(size, toRead));
				if(data == null) {
					// Wait for data to become available
					await new Promise((res) => (currentPiece.stream as Readable).once("readable", res));
				} else {
					data = Buffer.from(data);
					this.bytesRead += Math.min(toRead, data.length);
					reading = this.push(data.slice(0, toRead));
				}
			}
		}
	}
}
