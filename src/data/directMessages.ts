import { Connection, DM, DMRequest, EncryptedMessage, Friend } from "../../server/types"
import { apiRoute, POST } from "./http"
import { computeSharedKey, decryptMessage, encryptMessage, exportJWK, getLocalKeyPair, jwkToCryptoKey } from "../crypto_ecdh_aes";
import { createSignal } from "solid-js";

type DMEventType = 'unreadMessges' | 'newMessage'
type UnreadCountByConId = { [key: string]: number }
type LastReadTimestamp = { [key: string]: number }
const LAST_READ_DMS = 'lastCheckedDms'

console.log('GETTING DM CRYPTO KEYS')
let myPrivateKey: CryptoKey
const sharedKeyByConnectionId = new Map<string, CryptoKey>()
getLocalKeyPair().then(async keypair => {
	const jwk = await exportJWK(keypair.publicKey)
	myPrivateKey = keypair.privateKey

	const result = await POST(apiRoute.publicKey, { body: JSON.stringify(jwk) })
	if (!result.ok) {
		console.warn(`problem broadcasting public key`)
		console.log(result)
	}
}).catch((error) => {
	console.error(error)
})

class DMEventEmitter extends EventTarget {
	Dispatch(event: DMEventType, messagesByConId: Map<string, DM[]>) {
		this.dispatchEvent(new CustomEvent(event, { detail: messagesByConId }))
	}
	DispatchNewMessage(dm: DM) {
		const event: DMEventType = 'newMessage'
		this.dispatchEvent(new CustomEvent(event, { detail: dm }))
	}
}

const [unreadCountByConId, setUnreadCountByConId] = createSignal<UnreadCountByConId>({}, { equals: false })

export { unreadCountByConId }
const messagesByConId = new Map<string, DM[]>()
export const DirectMessageEvents = new DMEventEmitter()

export async function getRecentHistory(conId: string, publicKey, minCount = 20) {
	//.toSorted((a, b) => a.id - b.id)
	const messages = messagesByConId.get(conId) ?? []
	const lastRead = lastReadTimestamp(conId)

	const historyLength = messages?.length ?? 0
	if(minCount > historyLength) {
		
		const history = await getHistory({
			timestamp: lastRead,
			conId: conId,
			qty: minCount - historyLength
		}, publicKey)

		messages.splice(0,0,...history)
		messagesByConId.set(conId, messages)
	}

	return messages
}

function incrementUnreadCount(conId: string) {
	const counts = unreadCountByConId();
	counts[conId] = (counts[conId] ?? 0) + 1
	console.log('incrementUnreadCount', conId, counts[conId])
	setUnreadCountByConId(counts);
}

function clearUnreadCount(conId: string) {
	console.log('clearUnreadCount', conId, length)
	const counts = unreadCountByConId();
	counts[conId] = 0;
	setUnreadCountByConId(counts);
}

function setUnreadCount(conId: string, count: number) {
	console.log('setUnreadCount', conId, length)
	const counts = unreadCountByConId();
	counts[conId] = count;
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

	//TODO: update unread count as appropriate
	clearUnreadCount(conId)
}

export function onDMEvent(eventType: DMEventType, callback: (messagesByConId: Map<string, DM[]>) => void) {
	const ac = new AbortController()
	DirectMessageEvents.addEventListener(eventType, async (e: CustomEvent) => {
		callback(e.detail)
	}, { signal: ac.signal })
	return ac
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
		console.log(`can't get unread messages yet...`, friends?.length, connections?.length)
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
		const unread = await getUnread({ timestamp, conId }, con.publicKey)
		console.log('getUnreadDms', conId, con.identity?.name, { timestamp }, unread)
		if (unread?.length > 0) {
			setUnreadCount(conId, unread.length)
			if (!messagesByConId.has(conId))
				messagesByConId.set(conId, unread)
			else {
				//only add new messages to the list
				const messages = messagesByConId.get(conId)
				for (const um of unread) {
					if (!messages.some(m => m.id === um.id))
						messages.push(um)
				}
				messages.sort((a, b) => a.id - b.id)
			}
		}
	}

	DirectMessageEvents.Dispatch('unreadMessges', messagesByConId)
}

export async function sendDm(fromId: string, fromName: string, con: Connection, message: string) {
	if(!message) throw new Error('cannot send an empty message')

	const dm: DM = {
		toId: con.id,
		fromId,
		fromName,
		message,
	}

	const sharedKey = await getSharedKey(con.id, con.publicKey);

	const encryptedDm = {
		...dm,
		message: await encryptMessage(message, sharedKey)
	}

	const response = await POST(apiRoute.dm, { body: JSON.stringify(encryptedDm) })

	if (response.ok) {
		const savedDm = await response.json() as DM
		dm.timestamp = savedDm.timestamp
		setLastReadTimestamp(con.id, savedDm.timestamp)

		if (!messagesByConId.has(con.id))
			messagesByConId.set(con.id, [dm])
		else
			messagesByConId.get(con.id).push(dm)
	}

	return dm
}

async function getHistory(dmReq: DMRequest, publicKey: string) {
	const result = await POST(apiRoute.dmHistory, { body: JSON.stringify(dmReq) })
	const messages = await result.json() as DM[]
	const key = await getSharedKey(dmReq.conId, publicKey)
	return await decryptMessages(key, messages);
}

async function getUnread(dmReq: DMRequest, publicKey: string) {
	const result = await POST(apiRoute.dmUnread, { body: JSON.stringify(dmReq) })
	const messages = await result.json() as DM[]
	const key = await getSharedKey(dmReq.conId, publicKey);
	return await decryptMessages(key, messages);
}

async function decryptMessages(sharedKey: CryptoKey, messages: DM[]) {
	for (const m of messages) {
		try {
			const decrypted = await decryptMessage(JSON.parse(m.message as string), sharedKey);
			m.message = decrypted;
		} catch (err) {
			console.warn(err)
		}
	}

	return messages;
}

async function getSharedKey(conId: string, publicKey: string) {
	if (!sharedKeyByConnectionId.has(conId)) {
		const pubKey = await jwkToCryptoKey(JSON.parse(publicKey))
		const key = await computeSharedKey(myPrivateKey, pubKey)
		sharedKeyByConnectionId.set(conId, key)
	}

	return sharedKeyByConnectionId.get(conId)
}

export async function handleNewDirectMessage(con: Connection, dm: DM) {
	const key = await getSharedKey(dm.fromId, con.publicKey)
	dm.message = await decryptMessage(dm.message as EncryptedMessage, key);
	if (!messagesByConId.has(con.id))
		messagesByConId.set(con.id, [dm])
	else
		messagesByConId.get(con.id).push(dm)

	incrementUnreadCount(con.id)
	DirectMessageEvents.DispatchNewMessage(dm);
}
