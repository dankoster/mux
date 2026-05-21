import { Connection } from "../server/types";


export function displayName(con: Connection, verbose: boolean = false): string | undefined {
	const name = con?.identity && verbose ? `${con?.identity?.name} (${con.kind})` : con?.identity?.name
	return name || shortId(con?.id);
}

export function shortId(id: string | undefined) { return id?.substring(id.length - 4) }

