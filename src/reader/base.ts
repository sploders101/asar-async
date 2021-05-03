import {
	AsarIndex,
	AsarFile,
} from "src/common/types";
import {
	isFolder,
} from "src/common/functions";

/**
 * Function type for an AsarArchive getter.
 */
export type AsarGetter = (offset: number, length: number) => Buffer | Promise<Buffer>;

export const getter = Symbol("getter");
export const index = Symbol("index");
export const dataOffset = Symbol("headerOffset");

/**
 * Allows reading from asar archives using basic functions designed to mimic the fs promises api.
 *
 * Instead of loading in the entire archive synchronously (like the original module), this class accesses
 * the archive through a getter passed into the constructor. The getter is passed `offset` and
 * `length` variables, and must return a Buffer, or Promise<Buffer>
 * of the requested contents.
 */
export default class AsarArchive {
	[getter]: AsarGetter; // The getter used to retrieve chunks of the file
	[index]: AsarIndex | null = null; // The archive's parsed index
	[dataOffset]: number | null = null; // The offset at which the file data begins (added to index's offset)

	constructor(getterFunc: AsarGetter) {
		if(typeof(getterFunc) !== "function") throw new Error("AsarArchive only supports getters. Try EasyAsar.");
		this[getter] = getterFunc;
	}

	/**
	 * Fetch the index of the asar archive. Since archives don't usually change, this gets cached for future requests
	 */
	async fetchIndex() {
		const len = (await this[getter](4, 4)).readUInt32LE(0);
		this[dataOffset] = 8 + len;
		const header = await this[getter](12, len);
		const strlen = header.readUInt32LE(0);
		this[index] = JSON.parse(header.toString("utf8", 4, 4 + strlen));
	}

	/**
	 * Gets the AsarIndex object for the requested file
	 * @param filePath Path to the file relative to the archive's root
	 */
	getFileIndex(filePath: string) {
		if(!this[index]) throw new Error("The index has not been fetched");
		const pathSplit = filePath.split("/").filter((_)=>_);
		let fileDesc: AsarIndex | AsarFile = this[index];
		for (let i = 0; i < pathSplit.length; i++) {
			if(!isFolder(fileDesc)) throw fsErr("ENOENT: no such file or directory", "ENOENT", -2, "scandir");
			fileDesc = fileDesc.files[pathSplit[i]];
			if(typeof(fileDesc) === "undefined") throw fsErr("ENOENT: no such file or directory", "ENOENT", -2, "open");
		}
		return fileDesc;
	}

	/**
	 * Determines whether or not the specified location is a folder
	 * @param filePath Location relative to the archive's root
	 */
	isFolder(filePath: string) {
		return isFolder(this.getFileIndex(filePath));
	}

	/**
	 * List the files/folders within a directory
	 * @param filePath Path to folder
	 */
	readdir(filePath: string) {
		const fileIndex = this.getFileIndex(filePath);
		if(!isFolder(fileIndex)) throw fsErr("ENOTDIR: not a directory", "ENOTDIR", -20, "scandir");
		return Object.keys(fileIndex.files);
	}

	/**
	 * Asynchronously reads the contents of the requested file, resolving them as a Buffer
	 * @param filePath Path to file
	 */
	async readFile(filePath: string) {
		if(!this[index]) await this.fetchIndex();
		const fileIndex = this.getFileIndex(filePath);
		if(isFolder(fileIndex)) throw fsErr("EISDIR: illegal operation on a directory, read", "EISDIR", -21, "read");
		const offset = this[dataOffset] + Number(fileIndex.offset);
		return await this[getter](offset, fileIndex.size);
	}
}

export function fsErr(msg: string, code: string, errno: number, syscall: string) {
	const err = new Error(msg) as NodeJS.ErrnoException;
	err.code = code;
	err.errno = errno;
	err.syscall = syscall;
	return err;
}
