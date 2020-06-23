# async-asar

This library creates a class-based interface for reading and streaming asar files from any location.
By default, it can read from the filesystem or HTTP/HTTPS using the built-in backends.
However, it allows you to write your own backend using request functions, which only load parts of the file into memory.
This module does not require any dependencies, and has been split out into different files of varying complexity to keep it lightweight and versatile.
All of the code has been documented and commented, with typings provided.

## File Structure

### `index` (contains `EasyAsar`)
Defines the EasyAsar class that you will most likely use. This extends the `streams` implementation to allow the use of filesystem, HTTP, and HTTPS backends by default. Simply provide a file path or URL to the constructor.

### `streams` (contains `AsarStreams`)
This defines the streaming implementation of the asar reader, extending upon the base to allow streaming a file from the archive.

### `base` (contains `AsarArchive`)
This defines the base implementation of the asar reader, usable in the browser via a Buffer polyfill.


## Constructors

### `EasyAsar` examples
```typescript
const ar = new EasyAsar("/home/user/testing.asar");
const ar = new EasyAsar("file:///home/user/testing.asar");
const ar = new EasyAsar("http://example.com/testing.asar");
const ar = new EasyAsar("https://example.com/testing.asar");
const ar = new EasyAsar(new URL("file:///home/user/testing.asar"));
const ar = new EasyAsar(new URL("http://example.com/testing.asar"));
const ar = new EasyAsar(new URL("https://example.com/testing.asar"));
```
This constructor will also accept AsarStreams getter functions

### `AsarStreams`
```typescript
const ar = new AsarStreams((offset, length) => {
	return fs.createReadStream("/path/to/file.asar", {
		start: offset,
		end: offset + length - 1,
	});
});
```
The getter function can also return a promise resolving the stream
This constructor will also accept `AsarArchive` getter functions.

### `AsarArchive`
```typescript
const ar = AsarArchive((offset, length) => new Promise((res, rej) => {
	fs.open("/path/to/file.asar", (fd) => {
		fs.read(fd, {
			buffer: Buffer.allocUnsafe(length),
			position: offset,
			length,
		}, (err, bytesRead, buf) => {
			if(err) rej(err);
			if(bytesRead !== length) rej(new Error("Incomplete data"));
			res(buf);
		});
	});
}));
```
The getter can also return the Buffer directly.


## Methods

### `AsarArchive`

#### `fetchIndex`
```typescript
await ar.fetchIndex();
```
Fetches the asar archive's file index, caching it for later use. This function must be run before anything else can be done.

#### `getFileIndex`
```typescript
const index: AsarIndex | AsarFile = ar.getFileIndex("/path/to/file");
```
Gets the metadata for a file/folder

#### `isFolder`
```typescript
const isFolder: boolean = ar.isFolder("/path/to/file/or/folder");
```
Determines whether a path points to a file or folder

#### `readdir`
```typescript
const children: string[] = ar.readdir("/path/to/folder");
```
Lists the names of file/folders within the requested folder

#### `readFile`
```typescript
const contents: Buffer = await ar.readFile("/path/to/file");
```
Reads the contents of a file asynchronously

### `AsarStreams extends AsarArchive`

#### `createReadStream`
```typescript
const fileStream: Readable = await ar.createReadStream("/path/to/file");
fileStream.pipe(process.stdout);
// or
fileStream.on("data", (chunk) => process.stdout.write(chunk));
fileStream.on("end", () => console.log("Data finished"));
```
Creates a readable stream through which you can retrieve the file's contents.

### `EasyAsar extends AsarStreams`

EasyAsar only provides built-in backends and thus does not add any new methods
