
export type AuthTokenName = "Authorization";
export type ApiRoute = "sse" |
  "becomeAnonymous" |
  "setColor" |
  "setText" |
  "clear" |
  "log" |
  "discardKey" |
  "webRTC" |
  "room" |
  "room/join";

//is there a way to have the RoomRoute be nested under ApiRoute
// like this { setColor: "setColor", room: { join: "room/join"}}
// type FullApi = { 
// 	[Property in ApiRoute | RoomRoute]: 
// 	Property extends RoomRoute ? `room/${Property}` : Property 
// }


export type SSEvent = "pk" |
  "id" |
  "webRTC" |
  "connections" |
  "new_connection" |
  "rooms" |
  "new_room" |
  "delete_connection" |
  "delete_room" |
  "update" |
  "reconnect";

export type Room = {
  id: string;
  ownerId: string;
};

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
  roomId?: string;
  kind?: string;
  identity?: Identity;
};

export type Update = {
  connectionId: string;
  field: keyof Connection;
  value: string;
};
