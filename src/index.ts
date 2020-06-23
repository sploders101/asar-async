import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import {
	AsarGetter,
} from "./base";
import AsarStreams, {
	AsarGetterStream,
} from "./streams";
import {
	Readable,
} from "stream";

/**
 * Allows reading from asar archives using basic functions designed to mimic the fs promises api.
 *
 * Instead of loading in the entire archive synchronously (like the original module), this class accesses
 * the archive through a reference passed into the constructor.
 *
 * Supported Types:
 * * Getter Function
 * 	* (offset: number, length: number) => Buffer | Promise resolving to buffer
 * * File path
 * 	* string | URL
 * * http or https
 * 	* URL
 *
 * Extends AsarArchive
 *
 * @param file File path, URL, or getter function
 */
export class EasyAsar extends AsarStreams {
	constructor(file: AsarGetter | AsarGetterStream | string | URL) {
		if(typeof(file) === "function") {
			// If file is a getter, pass it on
			super(file);
		} else if(typeof(file) === "string") {
			if(file.match(/^[a-zA-Z]+:\/\/./)) {
				file = new URL(file);
				if(file.protocol === "file:") {
					// If file is a URL with file protocol, use safe filesystem backend.
					super(fsGetter(file.pathname));
				} else if(file.protocol.match(/^https?:$/)) {
					// If file is a URL with the http/https protocol, use the http backend.
					super(httpGetter(file));
				} else {
					throw new Error("Unrecognized Protocol");
				}
			} else {
				super(fsGetter(path.resolve(file)));
			}
		}
	}
}


// ┌──────────────────────┐
// │    Common Getters    │
// └──────────────────────┘

/**
 * Filesystem-backed asar getter.
 * @param filePath Path to archive
 */
export function fsGetter(filePath: string) {
	return (offset: number, length: number) => {
		return fs.createReadStream(filePath, {
			start: offset,
			end: offset + length - 1,
		});
	};
}

/**
 * HTTP/HTTPS-backed asar getter.
 * @param url URL of requested asar file
 */
export function httpGetter(url: string | URL) {
	// Normalize URL
	if(typeof(url) === "string") url = new URL(url);

	// Determine whether to use http or https
	const module = url.protocol === "http:"
		? http
		: url.protocol === "https:"
			? https
			: null;
	if(!module) throw new Error("Protocol must be http or https");

	// Return getter function
	return (offset: number, length: number) => new Promise<Readable>((res) => {
		// Create request using predetermined module
		module.request(url, {
			headers: {
				// Set the byte range that we would like to retrieve
				Range: `bytes=${offset}-${offset + length - 1}`,
			},
		}, res).end();
	});
}
