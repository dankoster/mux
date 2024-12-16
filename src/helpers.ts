import { Connection } from "../server/types";


export function displayName(con: Connection): string {
	return con?.identity ? `${con?.identity?.name} (${con.kind})` : shortId(con?.id);
}

export function shortId(id: string) { return id?.substring(id.length - 4) }

