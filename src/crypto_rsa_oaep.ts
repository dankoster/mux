
// https://mdn.github.io/dom-examples/web-crypto/encrypt-decrypt/index.html
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/exportKey

const algorithm: RsaHashedKeyGenParams = {
	name: "RSA-OAEP",
	modulusLength: 2048,
	publicExponent: new Uint8Array([1, 0, 1]),
	hash: "SHA-256",
}
const extractable = true
const PRIVATE_KEY = 'prikey'
const PUBLIC_KEY = 'pubkey'

export async function getKeys() {
	return await getSavedKeys() ?? await generateKeys()
}

async function getSavedKeys() {
	const oldPrivateKeyString = localStorage.getItem(PRIVATE_KEY)
	if (!oldPrivateKeyString) {
		console.log('failed to get public key from local storage')
		return
	}

	const privateKey = await window.crypto.subtle.importKey(
		"jwk",
		JSON.parse(oldPrivateKeyString) as JsonWebKey,
		algorithm,
		extractable,["decrypt"]
	)
	
	const oldPublicKeyString = localStorage.getItem(PUBLIC_KEY)
	if (!oldPublicKeyString) {
		console.log('failed to get public key from local storage')
		return
	}

	const publicJWK = JSON.parse(oldPublicKeyString) as JsonWebKey
	const publicKey = await window.crypto.subtle.importKey(
		"jwk",
		publicJWK,
		algorithm,
		extractable,
		["encrypt"]
	)

	console.log("RETRIEVED KEY PAIR")
	return { privateKey, publicKey, publicJWK }
}

export async function publicJwkToCryptoKey(jwk: string): Promise<CryptoKey> {
	return await window.crypto.subtle.importKey(
		"jwk",
		JSON.parse(jwk) as JsonWebKey,
		algorithm,
		extractable,
		["encrypt"]
	)
}

async function generateKeys() {
	const newKeyPair = await window.crypto.subtle.generateKey(algorithm, extractable, ["encrypt", "decrypt"])

	const privateJWK = await window.crypto.subtle.exportKey("jwk", newKeyPair.privateKey);
	const publicJWK = await window.crypto.subtle.exportKey("jwk", newKeyPair.publicKey);

	localStorage.setItem(PRIVATE_KEY, JSON.stringify(privateJWK))
	localStorage.setItem(PUBLIC_KEY, JSON.stringify(publicJWK))

	console.log('GENERATED KEY PAIR')
	return {...newKeyPair, publicJWK}
}

export async function encryptMessage(key: CryptoKey, message: string) {
	let enc = new TextEncoder();
	const encoded = enc.encode(message);
	const cipherText = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, encoded)
	return new Uint32Array(cipherText).toString()
}

export async function decryptMessage(key: CryptoKey, message: string) {
	const buffer = Uint32Array.from(message.split(',').map(s => Number.parseInt(s))) 
	const decrypted = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, buffer)
	const dec = new TextDecoder();
	return dec.decode(decrypted);
}

