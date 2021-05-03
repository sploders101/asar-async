/**
 * The type that an asar index's directories follow
 */
export interface AsarIndex {
	files: {
		[key: string]: AsarIndex | AsarFile;
	};
}

export interface AsarFileAttributes {
	executable?: boolean;
}

/**
 * The type that an asar index's files follow
 */
export interface AsarFile extends AsarFileAttributes {
	offset: string;
	size: number;
}
