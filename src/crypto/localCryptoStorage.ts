
import { ECDH_PRIVATE_KEY, ECDH_PUBLIC_KEY } from "../data/localStore"
import { exportJWK, generateKeyPair, jwkToCryptoKey } from "./crypto_ecdh_aes"

export function sameAsPrivateKey(newKey: JsonWebKey) {
	const curKey = JSON.parse(localStorage.getItem(ECDH_PRIVATE_KEY) ?? '{}')
	for (const prop in newKey) {
		if (JSON.stringify(curKey[prop]) !== JSON.stringify(newKey[prop as keyof JsonWebKey]))
			return false
	}
	return true
}

export async function replaceLocaLKeyPair(keypair: CryptoKeyPair) {
	localStorage.setItem(ECDH_PRIVATE_KEY, JSON.stringify(await exportJWK(keypair.privateKey)))
	localStorage.setItem(ECDH_PUBLIC_KEY, JSON.stringify(await exportJWK(keypair.publicKey)))
}

export async function getLocalKeyPair() {
	const lsPr = localStorage.getItem(ECDH_PRIVATE_KEY)
	const lsPu = localStorage.getItem(ECDH_PUBLIC_KEY)

	if (lsPr && lsPu) {
		//got keys from local storage
		try {
			const privateKey = await jwkToCryptoKey(JSON.parse(lsPr) as JsonWebKey, ['deriveBits'])
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
