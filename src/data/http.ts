import { ApiRoute } from "../../server/types";
import { API_URI } from "../API_URI";
import { AUTH_TOKEN_HEADER_NAME, pk } from "./data";

export const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	webRTC: "webRTC",
	setColor: "setColor",
	setText: "setText",
	clear: "clear",
	discardKey: "discardKey",
	becomeAnonymous: "becomeAnonymous",
	log: "log",
	friendRequest: "friendRequest",
	acceptFriendRequest: "acceptFriendRequest",
	dm: "dm",
	publicKey: "publicKey",
	dmHistory: "dmHistory",
	dmUnread: "dmUnread",
	position: "position",
	broadcastJson: "broadcastJson",
	initiateCall: "initiateCall"
};

export async function GET(route: ApiRoute, subRoute?: string) {
	const headers = {};
	headers[AUTH_TOKEN_HEADER_NAME] = pk();
	const url = [API_URI, route, subRoute].filter(s => s).join('/')
	return await fetch(url, {
		method: "GET",
		headers
	});
}

type PostOptions = { subRoute?: string, body?: string, authToken?: string }
export async function POST(route: ApiRoute, options?: PostOptions) {
	const headers = {};
	headers[AUTH_TOKEN_HEADER_NAME] = options?.authToken ?? pk();
	if (!route) throw new Error(`invalid route: ${route}`)
	const url = [API_URI, route, options?.subRoute].filter(s => s).join('/')
	return await fetch(url, {
		method: "POST",
		body: options?.body,
		headers
	});
}

export async function DELETE(route: ApiRoute, subRoute: string) {
	const headers = {};
	headers[AUTH_TOKEN_HEADER_NAME] = pk();
	const url = [API_URI, route, subRoute].join('/')
	return await fetch(url, { method: "DELETE", headers });
}
