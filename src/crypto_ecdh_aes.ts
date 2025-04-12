import { EncryptedMessage } from "../server/types"
import { ECDH_PRIVATE_KEY, ECDH_PUBLIC_KEY } from "./data/localStore"

const algorithm: EcKeyImportParams = {
	"name": "ECDH",
	"namedCurve": "P-256"
}
const extractable = true
const deriveBits: KeyUsage[] = ['deriveBits']

export async function replaceLocaLKeyPair(keypair: CryptoKeyPair) {
	localStorage.setItem(ECDH_PRIVATE_KEY, JSON.stringify(await exportJWK(keypair.privateKey)))
	localStorage.setItem(ECDH_PUBLIC_KEY, JSON.stringify(await exportJWK(keypair.publicKey)))
}
export async function sameAsPrivateKey(newKey: JsonWebKey) {
	const curKey = JSON.parse(localStorage.getItem(ECDH_PRIVATE_KEY))
	for (const prop in newKey) {
		if (JSON.stringify(curKey[prop]) !== JSON.stringify(newKey[prop]))
			return false
	}
	return true
}
export async function getLocalKeyPair() {
	const lsPr = localStorage.getItem(ECDH_PRIVATE_KEY)
	const lsPu = localStorage.getItem(ECDH_PUBLIC_KEY)

	if (lsPr && lsPu) {
		//got keys from local storage
		try {
			const privateKey = await jwkToCryptoKey(JSON.parse(lsPr) as JsonWebKey, deriveBits)
			const publicKey = await jwkToCryptoKey(JSON.parse(lsPu) as JsonWebKey, [])
			return { privateKey, publicKey }
		} catch (error) {
			//invalid key pair! (probably an old RSA pair)
			console.error(error)
		}
	}

	//keys invalid or not found in local storage
	const keypair = await generateKeyPair()
	localStorage.setItem(ECDH_PRIVATE_KEY, JSON.stringify(await exportJWK(keypair.privateKey)))
	localStorage.setItem(ECDH_PUBLIC_KEY, JSON.stringify(await exportJWK(keypair.publicKey)))
	return keypair
}

export async function jwkToCryptoKey(jwk: JsonWebKey, keyUsage: KeyUsage[] = []): Promise<CryptoKey> {
	return await window.crypto.subtle.importKey('jwk', jwk, algorithm, extractable, keyUsage)
}

export async function exportJWK(publicKey: CryptoKey): Promise<JsonWebKey> {
	return await window.crypto.subtle.exportKey('jwk', publicKey)
}

async function generateKeyPair() {
	return await crypto.subtle.generateKey(algorithm, extractable, deriveBits);
}

export async function computeSharedKey(myPrivateKey: CryptoKey, theirPublicKey: CryptoKey, iterations?: number) {
	// sharedBits - Both sides can now compute the shared bits.
	// The ship's private key is used as the "key", the other ship's public key is used as "public".
	var sharedBits = await crypto.subtle.deriveBits({
		"name": "ECDH",
		"public": theirPublicKey
	}, myPrivateKey, 256);

	// The first half of the resulting raw bits is used as a salt.
	var sharedDS = sharedBits.slice(0, 16);

	// The second half of the resulting raw bits is imported as a shared derivation key.
	var sharedDK = await crypto.subtle.importKey('raw', sharedBits.slice(16, 32), "PBKDF2", false, ['deriveKey']);

	// A new shared AES-GCM encryption / decryption key is generated using PBKDF2
	// This is computed separately by both parties and the result is always the same.
	var key = await crypto.subtle.deriveKey({
		"name": "PBKDF2",
		"salt": sharedDS,
		"iterations": iterations || 500000,
		"hash": "SHA-256"
	}, sharedDK, {
		"name": "AES-GCM",
		"length": 256
	}, true, ['encrypt', 'decrypt']);

	return key
}

export async function encryptMessage(message: string, sharedKey: CryptoKey) {

	const messageBytes = new TextEncoder().encode(message);

	// A random iv can be generated and used for encryption
	const iv_Uint8Array = crypto.getRandomValues(new Uint8Array(12));

	// The iv and the message are used to create an encrypted series of bits.
	const encrypted_ArrayBuffer = await crypto.subtle.encrypt({
		"name": "AES-GCM",
		"iv": iv_Uint8Array
	}, sharedKey, messageBytes);

	const data = await bufferToBase64(encrypted_ArrayBuffer)
	const iv = await bufferToBase64(iv_Uint8Array)

	return { iv, data }
}

export async function decryptMessage(messageJson: EncryptedMessage, sharedKey: CryptoKey) {
	const data = base64ToUint8Array(messageJson.data)
	const iv = base64ToUint8Array(messageJson.iv)

	const decrypted = await crypto.subtle.decrypt({
		"name": "AES-GCM",
		"iv": iv
	}, sharedKey, data);

	const decoded = new TextDecoder().decode(decrypted);
	return decoded
}

async function demo(iterations: number = 100000) {

	var theirKeys = await generateKeyPair()
	var myKeys = await generateKeyPair()

	const sharedKey = await computeSharedKey(myKeys.privateKey, theirKeys.publicKey, iterations)

	// The raw bits of the actual encryption key can be exported and saved.
	// These bits should be stored encrypted and should reference the specfic party are communicating with.
	//var exported = await crypto.subtle.exportKey('raw', sharedKey);

	const message = 'this is a test!'
	const json = await encryptMessage(message, sharedKey)

	console.log('encrypted', json)

	//send message

	const decrypted = await decryptMessage(json, sharedKey)

	console.log('decrypted', decrypted)
}

//https://stackoverflow.com/a/66046176
// note: `buffer` arg can be an ArrayBuffer or a Uint8Array
async function bufferToBase64(buffer: ArrayBuffer) {
	const base64 = await new Promise<string>(resolve => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.readAsDataURL(new Blob([buffer]))
	});
	// remove the `data:...;base64,` part from the start
	return base64.slice(base64.indexOf(',') + 1);
}

function base64ToUint8Array(base64: string) {
	return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

// Deno.bench("100,000", async () => await demo(100000))
// Deno.bench("250,000", async () => await demo(250000))
// Deno.bench("500,000", async () => await demo(500000))
//demo()