export function trace(...message: any[]) {

	let stackTrace: { stack?: string } = {}
	//@ts-ignore
	Error.captureStackTrace(stackTrace, trace)
	const stack = Array.from(stackTrace.stack?.normalize().matchAll(/(?<=at ).*/g)??[], at => at[0])

	//console.log(stackTrace.stack, stack)

	const caller = stack[1]
	const callee = stack[0]?.substring(0, stack[0].indexOf(' '))
	console.groupCollapsed(...message || `${caller} --> ${callee}`)
	stack.forEach(s => console.log(s))
	console.groupEnd()
	const started = new Date()

	return {
		caller, callee, stack, started,
		elapsed: (message) => {
			let d = new Date(Date.now() - started.valueOf()).toISOString()
			console.log(...message || caller, d.substring(d.lastIndexOf('T') + 1, d.length - 1))
		}
	}
}