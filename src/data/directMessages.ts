import { Connection, DM, DMRequest, Friend } from "../../server/types"
import { apiRoute, POST } from "./http"
import { localStorage_GetMap } from "./localStore"
import { computeSharedKey, decryptMessage, encryptMessage, exportJWK, getLocalKeyPair, jwkToCryptoKey } from "../crypto_ecdh_aes";

type DMEventType = 'unreadMessges' | 'newMessage'
class DMEventEmitter extends EventTarget {
	Dispatch(event: DMEventType, messagesByConId: Map<string, DM[]>) {
		this.dispatchEvent(new CustomEvent(event, { detail: messagesByConId }))
	}
	NewMessage(dm: DM) {
		const event: DMEventType = 'newMessage'
		this.dispatchEvent(new CustomEvent(event, { detail: dm }))
	}
}

const LAST_READ_DMS = 'lastCheckedDms'
export const byConId = new Map<string, DM[]>()
export const lastReadDmByConId = localStorage_GetMap<string, number>(LAST_READ_DMS)
export const DirectMessageEvents = new DMEventEmitter()

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

console.log('GETTING DM CRYPTO KEYS')
let myPrivateKey: CryptoKey
const sharedKeyByConnectionId = new Map<string, CryptoKey>()
getLocalKeyPair().then(async keypair => {
	const jwk = await exportJWK(keypair.publicKey)
	myPrivateKey = keypair.privateKey
	broadcastPublicKey(jwk)
}).catch((error) => {
	console.error(error)
})

async function broadcastPublicKey(key: JsonWebKey) {
	return POST(apiRoute.publicKey, { body: JSON.stringify(key) })
}


//we're starting up... query the server for unread messages
export async function udpateUnreadMessages(friends: Friend[], connections: Connection[]) {
	if (!friends?.length || !connections?.length) {
		console.log(`can't get unread messages yet...`, friends?.length, connections?.length)
		return
	}
	const friendConId = connections
		.filter(c => friends.some(f => f.friendId === c.identity?.id))
		.map(c => c.id)

	for (const conId of friendConId) {
		const timestamp = lastReadDmByConId.get(conId)
		const con = connections.find(c => c.id === conId)
		if(!con.publicKey){
			console.log('getUnreadDms', conId, con.identity?.name, 'has no public key')
			continue
		}
		console.log('getUnreadDms', conId, con.identity?.name, {timestamp})
		const unread = await getUnreadDms({ timestamp, conId }, con.publicKey)
		if (unread?.length > 0) {
			if (!byConId.has(conId))
				byConId.set(conId, unread)
			else {
				const messages = byConId.get(conId)
				for(const um of unread) {
					if(!messages.some(m => m.id === um.id))
						messages.push(um)
				}
				messages.sort((a,b) => a.id - b.id)
			}
		}
	}

	console.log('unread DMs', lastReadDmByConId, byConId)
	DirectMessageEvents.Dispatch('unreadMessges', byConId)
}

async function getDmHistory(dmReq: DMRequest, publicKey: string) {
	const result = await POST(apiRoute.dmHistory, { body: JSON.stringify(dmReq) })
	const messages = await result.json() as DM[]
	const key = await getSharedKey(dmReq.conId, publicKey)
	return await decryptMessages(key, messages);
}

async function getUnreadDms(dmReq: DMRequest, publicKey: string) {
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

export async function getSharedKey(conId: string, publicKey: string) {
	if (!sharedKeyByConnectionId.has(conId)) {
		const pubKey = await jwkToCryptoKey(JSON.parse(publicKey))
		const key = await computeSharedKey(myPrivateKey, pubKey)
		sharedKeyByConnectionId.set(conId, key)
	}

	return sharedKeyByConnectionId.get(conId)
}

