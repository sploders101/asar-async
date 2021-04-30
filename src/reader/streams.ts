// tslint:disable:max-classes-per-file
import AsarArchive, {
	AsarGetter,
	index,
	isFolder,
	fsErr,
	dataOffset,
} from "./base";
import {
	Readable,
} from "stream";

const getterType = Symbol("getterType");
const streamGetter = Symbol("streamGetter");

const chunkGetter = Symbol("chunkGetter");
const offsetSym = Symbol("offsetSym");
const endSym = Symbol("lengthSym");
const posSym = Symbol("pos");

class AsarChunkStream extends Readable {
	[chunkGetter]: AsarGetter;
	[offsetSym]: number;
	[endSym]: number;
	[posSym]: number;
	/**
	 * This class allows using chunk-based getters in stream applications. It's not the most efficient
	 * method there is (due to the fact that numerous read calls must be made), but can help avoid memory
	 * leaks by splitting the read operation into pieces.
	 * @param getter Chunk-based getter that takes (offset, length) and resolves to a buffer
	 * @param offset File offset at which the stream will start
	 * @param length Length of data to read from the file
	 */
	constructor(getter: AsarGetter, offset: number, length: number) {
		super({
			highWaterMark: 65536, // 64kb
		});
		this[chunkGetter] = getter;
		this[offsetSym] = offset;
		this[endSym] = offset + length;
		this[posSym] = offset;
	}
	async _read(size: number) {
		try {
			if(this[posSym] + size >= this[endSym]) { // If we are reading through/past the end of the file
				// Push the file's last remaining data
				this.push(await this[chunkGetter](this[posSym], this[endSym] - this[posSym]));
				// Close the stream
				this.push(null);
				// Move pointer to the end
				this[posSym] = this[endSym];
			} else {
				// Push the requested amount of data
				this.push(await this[chunkGetter](this[posSym], size));
				// Move pointer accordingly
				this[posSym] += size;
			}
		} catch(err) {
			// If we got an error while retrieving data, report it and destroy the stream
			this.destroy(err);
		}
	}
}

/**
 * Getter type for stream-based reads
 */
export type AsarGetterStream = (offset: number, length: number) => Readable | Promise<Readable>;

export default class AsarStreams extends AsarArchive {
	[getterType]: "chunk" | "stream" | null = null;
	[streamGetter]: AsarGetter | AsarGetterStream;

	/**
	 * Extends the AsarArchive class to allow for streaming reads.
	 *
	 * This class *will accept* the original buffer-based getters, and use them as efficiently as possible
	 * (by fetching chunks), but in most cases, a stream-based getter is preferrable in terms of overhead and
	 * performance.
	 * @param getterFunc Function that takes (offset, length) and resolves to either a Buffer or Readable stream
	 */
	constructor(getterFunc: AsarGetter | AsarGetterStream) {
		// Create chunk-based getter for parent's methods
		super(async (offset: number, length: number) => {
			// Get result of supplied getter
			const result = await getterFunc(offset, length);

			// If unknown, determine return type and save for future requests using the getter directly
			if(!this[getterType])
				this[getterType] =
					Buffer.isBuffer(result)
						? "chunk"
						: "stream";

			if(this[getterType] === "chunk") {
				// If it's a buffer, go ahead and return it. There's nothing more to do.
				return result as Buffer;
			} else if(this[getterType] === "stream") {
				// If it's a stream, collect all of the data before returning.
				return await new Promise<Buffer>((res, rej) => {
					const resStream = result as Readable;
					const data = [];
					resStream.on("data", (chunk) => data.push(chunk));
					resStream.on("end", () => res(Buffer.concat(data)));
					resStream.on("error", rej);
				});
			}
		});
		this[streamGetter] = getterFunc;
	}

	/**
	 * Creates a read stream of the requested file.
	 * @param file Path to file within asar archive
	 */
	async createReadStream(file: string) {
		if(!this[index]) await this.fetchIndex();
		const fileIndex = this.getFileIndex(file);
		if(isFolder(fileIndex)) throw fsErr("EISDIR: illegal operation on a directory, read", "EISDIR", -21, "read");
		const offset = this[dataOffset] + Number(fileIndex.offset);
		if(this[getterType] === "stream") {
			return await this[streamGetter](offset, fileIndex.size) as Readable;
		} else if(this[getterType] === "chunk") {
			return new AsarChunkStream(this[streamGetter] as AsarGetter, offset, fileIndex.size);
		}
	}
}
