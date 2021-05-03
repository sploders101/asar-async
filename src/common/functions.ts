import {
	AsarIndex,
	AsarFile,
} from "./types";

export function isFolder(fileIndex: AsarIndex | AsarFile): fileIndex is AsarIndex {
	return !!(fileIndex as any).files;
}
