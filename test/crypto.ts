import { assertEquals } from "jsr:@std/assert";
import { computeSharedKey, decryptMessage, encryptMessage, generateKeyPair } from "../src/crypto/crypto_ecdh_aes.ts";

Deno.test("encrypt and decrypt short message", async () => {

	var theirKeys = await generateKeyPair()
	var myKeys = await generateKeyPair()

	const sharedKey = await computeSharedKey(myKeys.privateKey, theirKeys.publicKey)

	const message = 'this is a test!'
	const encryptedJson = await encryptMessage(message, sharedKey)
	const decrypted = await decryptMessage(encryptedJson, sharedKey)

	assertEquals(message, decrypted)
});

