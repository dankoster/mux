import { Connection, DM, DMRequest, EncryptedMessage, Friend, JwkPair } from "../../server/types"
import { apiRoute, POST } from "./http"
import { computeSharedKey, decryptMessage, encryptMessage, exportJWK, getLocalKeyPair, jwkToCryptoKey, replaceLocaLKeyPair, sameAsPrivateKey } from "../crypto_ecdh_aes";
import { createSignal } from "solid-js";
import { localStorage_GetMap, localStorage_SetMap } from "./localStore";
import { connections, isSelf, self } from "./data";

type DMEventType = 'unreadMessges' | 'newMessage'
type UnreadCountByConId = { [key: string]: number }
type LastReadTimestamp = { [key: string]: number }
const LAST_READ_DMS = 'lastCheckedDms'
const SHARED_KEYS = 'sharedKeys'

// console.log('GETTING DM CRYPTO KEYS')
let myKeys: CryptoKeyPair

const sharedKeyByConnectionId = new Map<string, CryptoKey>()

const sharedJwkByConnectionId = new Map<string, string>(localStorage_GetMap(SHARED_KEYS))
sharedJwkByConnectionId.forEach(async (value, key) =>
	sharedKeyByConnectionId.set(key, await jwkToCryptoKey(JSON.parse(value), ['deriveBits'])))

getLocalKeyPair().then(async keypair => {
	myKeys = keypair
	await broadcastPublicKey(keypair.publicKey);
}).catch((error) => {
	console.error(error)
})

async function broadcastPublicKey(publicKey: CryptoKey) {
	const jwk = await exportJWK(publicKey)
	const result = await POST(apiRoute.publicKey, { body: JSON.stringify(jwk) });
	if (!result.ok) {
		console.warn(`problem broadcasting public key`);
		console.log(result);
	}
}

async function handleKeyShare(dm: DM) {
	if (dm.kind !== 'key-share') throw new Error(`${dm.kind} is not valid in handleKeyShare`)

	//does sender have an older key
	if (dm.fromId < self().id) {
		const fromCon = connections.find(c => c.id === dm.fromId)

		const key = await getSharedKey(myKeys.privateKey, `${dm.fromId}-${dm.toId}`, fromCon.publicKey);
		dm.message = await decryptMessage(dm.message as EncryptedMessage, key);

		const jwkPair = JSON.parse(dm.message) as JwkPair
		console.log('KEY SHARE', `${dm.fromId}-${dm.toId}`, jwkPair);

		if (sameAsPrivateKey(jwkPair.privateJwk)) {
			//current primary key already matche incoming key
			return
		}

		const privateKey = await jwkToCryptoKey(jwkPair.privateJwk, ['deriveBits']);
		const publicKey = await jwkToCryptoKey(jwkPair.publicJwk)

		console.log(`overwriting local keys with key shared from ${dm.fromId} ${dm.fromName}}`)
		myKeys = { privateKey, publicKey }
		replaceLocaLKeyPair(myKeys)
		broadcastPublicKey(publicKey)
	}
}


class DMEventEmitter extends EventTarget {
	Dispatch(event: DMEventType, messagesByConId: Map<string, Map<number, DM>>) {
		this.dispatchEvent(new CustomEvent(event, { detail: messagesByConId }))
	}
	DispatchNewMessage(dm: DM) {
		const event: DMEventType = 'newMessage'
		this.dispatchEvent(new CustomEvent(event, { detail: dm }))
	}
}

const [unreadCountByConId, setUnreadCountByConId] = createSignal<UnreadCountByConId>({}, { equals: false })

export { unreadCountByConId }
const messagesByConId = new Map<string, Map<number, DM>>()
export const DirectMessageEvents = new DMEventEmitter()

export async function getRecentHistory(conId: string, publicKey, minCount = 20) {
	if (!messagesByConId.has(conId))
		messagesByConId.set(conId, new Map<number, DM>())

	const messagesByMessageId = messagesByConId.get(conId)
	const lastRead = lastReadTimestamp(conId)

	if (minCount > messagesByMessageId.size) {
		const messages = await getHistory({
			timestamp: lastRead,
			conId: conId,
			qty: minCount - messagesByMessageId.size
		})
		for (const dm of messages) {
			await decryptAndSaveMessage(dm)
		}
	}

	//sort the result from oldest to newest
	return Array.from(messagesByMessageId.values()).sort((a, b) => a.timestamp - b.timestamp)
}

function incrementUnreadCount(conId: string) {
	const counts = unreadCountByConId();
	counts[conId] = (counts[conId] ?? 0) + 1
	// console.log('incrementUnreadCount', conId, counts[conId])
	setUnreadCountByConId(counts);
}

function clearUnreadCount(conId: string) {
	// console.log('clearUnreadCount', conId, length)
	const counts = unreadCountByConId();
	counts[conId] = 0;
	setUnreadCountByConId(counts);
}

export function lastReadTimestamp(conId: string) {
	const lastReadDmByConId: LastReadTimestamp = JSON.parse(localStorage.getItem(LAST_READ_DMS)) ?? {}
	return lastReadDmByConId[conId]
}

export function setLastReadNow(conId: string) {
	const lastReadDmByConId: LastReadTimestamp = JSON.parse(localStorage.getItem(LAST_READ_DMS)) ?? {}
	lastReadDmByConId[conId] = Date.now()
	localStorage.setItem(LAST_READ_DMS, JSON.stringify(lastReadDmByConId))

	console.log("setLastReadNow", conId)
	clearUnreadCount(conId)
}

export function setLastReadTimestamp(conId: string, timestamp: number) {
	const lastReadDmByConId: LastReadTimestamp = JSON.parse(localStorage.getItem(LAST_READ_DMS)) ?? {}
	lastReadDmByConId[conId] = timestamp
	localStorage.setItem(LAST_READ_DMS, JSON.stringify(lastReadDmByConId))

	console.log("setLastReadTimestamp", conId, timestamp)

	clearUnreadCount(conId)
}

export function onNewMessage(callback: (dm: DM) => void) {
	const ac = new AbortController()
	const event: DMEventType = 'newMessage'
	DirectMessageEvents.addEventListener(event, async (e: CustomEvent) => {
		callback(e.detail)
	}, { signal: ac.signal })
	return ac
}

//we're starting up... query the server for unread messages
export async function getAllUnread(friends: Friend[], connections: Connection[]) {
	if (!friends?.length || !connections?.length) {
		// console.log(`can't get unread messages yet...`, friends?.length, connections?.length)
		return
	}
	const friendConId = connections
		.filter(c => friends.some(f => f.friendId === c.identity?.id))
		.map(c => c.id)

	for (const conId of friendConId) {
		const con = connections.find(c => c.id === conId)
		if (!con.publicKey) {
			console.log('getUnreadDms', conId, con.identity?.name, 'has no public key')
			continue
		}

		//a falsey last read timestamp means min date (00000)
		const timestamp = lastReadTimestamp(conId)
		const messages = await getUnread({ timestamp, conId })
		for (const dm of messages) {
			await decryptAndSaveMessage(dm)
		}
	}

	DirectMessageEvents.Dispatch('unreadMessges', messagesByConId)
}

export async function sendDm(dm: DM, publicKey: string) {
	if (!dm || !dm?.message) throw new Error('cannot send an empty message')

	const sharedKey = await getSharedKey(myKeys.privateKey, `${dm.fromId}-${dm.toId}`, publicKey);
	const encryptedDm = {
		...dm,
		message: await encryptMessage(dm.message as string, sharedKey)
	}

	const response = await POST(apiRoute.dm, { body: JSON.stringify(encryptedDm) })

	if (response.ok) {
		const savedDm = await response.json() as DM
		dm.timestamp = savedDm.timestamp
		dm.id = savedDm.id
		setLastReadTimestamp(dm.toId, savedDm.timestamp)

		if (!messagesByConId.has(dm.toId))
			messagesByConId.set(dm.toId, new Map<number, DM>())

		messagesByConId.get(dm.toId).set(dm.id, dm)
	}

	return dm
}

async function getHistory(dmReq: DMRequest) {
	const result = await POST(apiRoute.dmHistory, { body: JSON.stringify(dmReq) })
	const messages = await result.json() as DM[]
	return messages
}

async function getUnread(dmReq: DMRequest) {
	const result = await POST(apiRoute.dmUnread, { body: JSON.stringify(dmReq) })
	const messages = await result.json() as DM[]
	return messages
}

async function getSharedKey(privateKey: CryptoKey, sharedKeyId: string, publicJwk: string) {
	if (!sharedKeyByConnectionId.has(sharedKeyId)) {
		const pubKey = await jwkToCryptoKey(JSON.parse(publicJwk))
		const key = await computeSharedKey(privateKey, pubKey)
		sharedKeyByConnectionId.set(sharedKeyId, key)
	}

	return sharedKeyByConnectionId.get(sharedKeyId)
}

export async function sharePrivateKey(myId: string, con: Connection) {
	const privateJwk = await exportJWK(myKeys.privateKey)
	const publicJwk = await exportJWK(myKeys.publicKey)
	sendDm({
		toId: con.id,
		fromId: myId,
		message: JSON.stringify({ privateJwk, publicJwk } as JwkPair),
		kind: "key-share"
	}, con.publicKey)
}

export async function handleNewDirectMessage(dm: DM) {
	await decryptAndSaveMessage(dm);
	if (dm.kind === 'text')
		DirectMessageEvents.DispatchNewMessage(dm);
}

async function decryptAndSaveMessage(dm: DM) {
	if (dm.kind === 'key-share') {
		await handleKeyShare(dm)
		return
	}

	const toCon = connections.find(c => c.id === dm.toId)
	const fromCon = connections.find(c => c.id === dm.fromId)
	const sentByMe = isSelf(fromCon);
	const publicKey = sentByMe ? toCon.publicKey : fromCon.publicKey
	const sharedKey = await getSharedKey(myKeys.privateKey, `${dm.fromId}-${dm.toId}`, publicKey);

	if (typeof dm.message === 'string')
		dm.message = JSON.parse(dm.message)

	try {
		dm.message = await decryptMessage(dm.message as EncryptedMessage, sharedKey);
	} catch (error) {
		console.warn(error)
		console.log('could not decrypt', dm)
	}

	const conId = sentByMe ? dm.toId : dm.fromId;
	if (!messagesByConId.has(conId))
		messagesByConId.set(conId, new Map<number, DM>())

	messagesByConId.get(conId).set(dm.id, dm)

	incrementUnreadCount(conId)
}

export type groupedDM = DM & { prevTimestamp?: number }
export function groupBySender(history: groupedDM[], minHoursSameSender = 24) {
	return history.reduce((acc: groupedDM[][], cur: groupedDM) => {
		const prev = acc[acc.length - 1];
		cur.prevTimestamp = prev && prev[prev.length - 1]?.timestamp
		if (!prev
			|| prev[0].fromName !== cur.fromName
			|| (cur.prevTimestamp && (cur.timestamp - cur.prevTimestamp > (1000 * 60 * 60 * minHoursSameSender)))
		) acc.push([cur]);
		else prev.push(cur);
		return acc;
	}, []);
}
