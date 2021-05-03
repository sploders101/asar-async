import {
	AsarIndex,
	AsarFileAttributes,
	AsarFile,
} from "../common/types";
import {
	Readable,
} from "stream";
import {
	isFolder,
} from "../common/functions";
import {
	SpliceEntry,
	StreamSplicer,
} from "./streamSplicer";

export interface AddFileOpts {
	path: string | string[];
	stream: Readable;
	size: number;
	attributes?: AsarFileAttributes;
}

export class AsarWriter {
	contentOffset = 0;
	fileList: SpliceEntry[] = [];
	index: AsarIndex = {
		files: {},
	};

	/**
	 * Add a file to the asar archive
	 *
	 * This uses `mkdir` internally to create parent directories automatically
	 * @param opts Information about the file to add
	 */
	addFile(opts: AddFileOpts): void {

		// Normalize file path
		const parentFolder = typeof(opts.path) === "string"
			? opts.path.split("/")
			: this.verifyPath(opts.path);
		const filename = parentFolder.pop();

		// Creates the directory and makes sure it's a directory
		this.mkdir(parentFolder);

		// Move into the directory
		let cwd = this.index;
		for(const step of parentFolder) {
			// We already verified this was a folder inside mkdir
			cwd = cwd.files[step] as AsarIndex;
		}

		// Throw error if file exists (messes up offsets)
		if(cwd.files[filename]) throw new Error("File exists and overwriting files is unsupported.");

		// Create file in index
		cwd.files[filename] = {
			...opts.attributes,
			offset: String(this.contentOffset),
			size: opts.size,
		} as AsarFile;

		// Increment contentOffset to the next available byte
		this.contentOffset += opts.size;

		// Append stream to file list for concatenation on output
		this.fileList.push({
			size: opts.size,
			stream: opts.stream,
		});

	}

	/**
	 * Create a new directory
	 * @param path Path to new directory
	 */
	mkdir(path: string | string[]) {
		const steps = typeof(path) === "string"
			? path.split("/")
			: this.verifyPath(path);

		let cwd = this.index;
		for(const step of steps) {
			if(!cwd.files[step]) {
				cwd.files[step] = { files: { } };
			} else if(!isFolder(cwd.files[step])) {
				throw new Error("Cannot create directory inside a file");
			}
			cwd = cwd.files[step] as AsarIndex;
		}
	}

	/**
	 * Create asar header buffer
	 *
	 * The asar header gets sent before the files in fileList to allow seeking of the archive
	 */
	private createAsarHeader() {

		const jsonHeader = JSON.stringify(this.index);

		// Align jsonHeader size to 4 bytes, since that's apparently pickle's magic string alignment value
		const headerSize = this.align(jsonHeader.length, 4);

		// Allocate pickle buffer
		// 4 (pickle size) + 4 (string size) + headerSize (string size aligned to 4 bytes)
		const headerPickle = Buffer.alloc(8 + headerSize);

		// Write length of pickle body
		// length of string length indicator + length of string // yes, I know it's confusing...
		// I'm not sure where this redundancy came from, but we gotta make it compatible...
		headerPickle.writeUInt32LE(4 + headerSize, 0);

		// Write *actual* string length
		headerPickle.writeUInt32LE(jsonHeader.length, 4);

		// Write index JSON string
		headerPickle.write(jsonHeader, 8, "utf-8");

		// Onto the size pickle (why exactly??? we've already written two size indicators...)
		const sizePickle = Buffer.alloc(8);
		// Size pickle data is always 4 bytes long
		sizePickle.writeUInt32LE(4, 0);
		// Write length of headerPickle
		sizePickle.writeUInt32LE(headerPickle.length, 4);

		return Buffer.concat([
			sizePickle,
			headerPickle,
		]);

	}

	createAsarStream() {
		const header = this.createAsarHeader();
		return new StreamSplicer([
			{
				size: header.length,
				stream: header,
			},
			...this.fileList,
		]);
	}

	/**
	 * Verifies that a path segment array is valid
	 * @param path Path segments represented as an array of strings
	 */
	private verifyPath(path: string[]) {
		for(let i = 0; i < path.length; i++) {
			if(path[i].includes("/")) throw new Error("Path segment cannot contain '/'.");
		}
		return path;
	}

	private align(i: number, alignTo: number) {
		return i + (alignTo - (i % alignTo)) % alignTo;
	}
}
