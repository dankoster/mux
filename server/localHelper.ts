
let debounce: number
export async function onLocalBuild(pathToWatch: string, debounceDelay: number, callback: ()=>void) {
	const watcher = Deno.watchFs(pathToWatch);
	for await (const event of watcher) {
		clearTimeout(debounce)
		debounce = setTimeout(() => {
			callback()
		}, debounceDelay);
	}
}