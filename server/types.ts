// @ts-types="npm:@types/webrtc"
import { Database } from "jsr:@db/sqlite";
import type * as webrtc from "npm:/@types/webrtc"
import { Identity } from "./data/table/identity.ts";

export type initiateCallResult = {
	["polite"]: boolean | undefined,
	peerConfig: RTCConfiguration
}

export type SSEventPayload = {
	event: SSEvent;
	data?: string;
	id?: string;
	retry?: string;
}


export type AuthTokenName = "Authorization";
export type ApiRoute =
	"auth" |
	"connections" |
	"sse" |
	"becomeAnonymous" |
	"setColor" |
	"clear" |
	"log" |
	"discardKey" |
	"webRTC" |
	"friendRequest" |
	"acceptFriendRequest" |
	"dm" |
	"dmHistory" |
	"dmUnread" |
	"publicKey" |
	"position" |
	"initiateCall" |
	"area" | "grabArea" | "releaseArea";

export type SSEvent =
	"initiateCall" |
	"webRTC" |
	"new_connection" |
	"delete_connection" |
	"update" |
	"refresh" |
	"reconnect" |
	"friendRequest" |
	"friendRequests" |
	"friendList" |
	"friendRequestAccepted" |
	"dm" |
	"addArea" |
	"removeArea" |
	"grabArea" |
	"releaseArea";


export type ConnectionStatus = "" | "online"
export type Connection = {
	id: string
	color?: string
	status?: ConnectionStatus
	kind?: string
	publicKey?: string
	identity?: Identity
	position?: Position
	quaternion?: QuaternionTuple
};

export type Position = {
	readonly x: number
	readonly y: number
	readonly z: number
}
export type QuaternionTuple = [x: number, y: number, z: number, w: number]

export type PositionMessage = { id: string, position: Position, quaternion?: QuaternionTuple }
export type PositionMessageHandler = (message: PositionMessage) => void

export type Update = {
	connectionId: string;
	field: keyof Connection;
	value: string;
};

export type Friend = {
	id: string,
	myId: string,
	friendId: string
}

export type FriendRequest = {
	id: string,
	fromId: number,
	toId: number,
	status: string
}

export type DM = {
	id?: number,
	toId: string,
	fromId: string,
	fromName?: string,
	timestamp: number,
	message: string | EncryptedMessage,
	kind: 'key-share' | 'text' | 'call'
}

export type EncryptedMessage = { iv: string, data: string }


export type DMInsert = {
	toUuid: string,
	fromUuid: string,
	toIdentityId?: number,
	fromIdentityId?: number,
	message: string | EncryptedMessage,
}

export type DMRequest = {
	qty?: number,
	timestamp: number,
	conId: string
}

export type JwkPair = {
	privateJwk: JsonWebKey,
	publicJwk: JsonWebKey
}

export type AreaNotification = {
	conId: string,
	areaId: string,
	position?: Position
}
