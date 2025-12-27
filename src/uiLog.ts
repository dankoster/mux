
var logs = new Map<number, HTMLElement>()

export type uiLogOptions = {
	logId?: number,
	timeoutMs?: number,
}

export function uiLog(value: string, { logId, timeoutMs = 5000 }: uiLogOptions = {}) {
	let logElement = getLogElement()

	if(logs.has(logId)) {
		clearTimeout(logId)
		const logElement = logs.get(logId)
		logs.delete(logId)
		// logElement.textContent = `[${logId}]${value}`
		logElement.textContent = value
		logId = setTimeout(() => {
			logElement.remove()
			logs.delete(logId)
		}, timeoutMs);
		logs.set(logId, logElement)
		return logId
	}

	const logEntry = document.createElement('pre')
	logEntry.style.margin = "0"
	logEntry.textContent = value
	logElement.appendChild(logEntry)
	logEntry.scrollIntoView() //{behavior: "smooth"})

	const id = setTimeout(() => {
		logEntry.remove()
		logs.delete(id)
	}, timeoutMs);

	if(logs.has(id as number)) 
		throw new Error(`${id} already exists in logs`)

	logs.set(id, logEntry);

	return id
}

function getLogElement() {
	let logElement = document.getElementById('logger')

	if (!logElement) {
		logElement = document.createElement('div')
		logElement.id = 'logger'
		logElement.style.position = 'absolute'
		logElement.style.backdropFilter = "blur(10px)"
		logElement.style.maxHeight = '100svh' 
		logElement.style.maxWidth = '100svw' 
		logElement.style.overflowY = 'auto'
		logElement.style.overflowX = 'hidden'
		logElement.style.opacity = '0.7'

		document.body.appendChild(logElement)
	}
	return logElement
}

