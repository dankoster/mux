export function localStorage_GetMap<K, V>(key: string) {
	const lsValue = localStorage.getItem(key)
	try {
		return new Map<K, V>(JSON.parse(lsValue))
	} catch (err) {
		console.warn(`local storage value could not be converted to a map for ${key}: ${err.message}`)
		return new Map<K, V>()
	}
}

export function localStorage_SetMap<K, V>(key: string, value: Map<K, V>) {
	localStorage.setItem(key, JSON.stringify(Array.from(value)))
}
