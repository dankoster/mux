
let debounce: number
export async function onLocalBuild(pathToWatch: string, callback: ()=>void) {
	const watcher = Deno.watchFs(pathToWatch);
	for await (const event of watcher) {
		clearTimeout(debounce)
		debounce = setTimeout(() => {
			callback()
		}, 100);
	}
}