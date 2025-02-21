
export type AuthTokenName = "Authorization";
export type ApiRoute = "sse" |
	"becomeAnonymous" |
	"setColor" |
	"setText" |
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
	"position";

export type SSEvent = "pk" |
	"id" |
	"webRTC" |
	"connections" |
	"new_connection" |
	"delete_connection" |
	"update" |
	"refresh" |
	"reconnect" |
	"friendRequest" |
	"friendRequests" |
	"friendList" | 
	"friendRequestAccepted" |
	"dm";

export type Identity = {
	id?: string;
	source?: string;
	source_id?: string;
	name?: string;
	avatar_url?: string;
};

export type Connection = {
	id: string;
	color?: string;
	text?: string;
	status?: string | null;
	kind?: string;
	publicKey?: string;
	identity?: Identity;
};

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
	fromId: string,
	toId: string,
	status: string
}

export type DM = { 
	id?: number,
	toId: string, 
	fromId: string,
	fromName?: string,
	timestamp?: number,
	message: string | EncryptedMessage, 
	kind: 'key-share'|'text'|'call'
}

export type EncryptedMessage = { iv: string, data: string }


export type DMInsert = { 
	toUuid: string, 
	fromUuid: string,
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
