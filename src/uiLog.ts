
var logs = new Map<number, UiLog>()

type UiLog = {timeoutId: number, element: HTMLElement}
export type uiLogOptions = {
	logId?: number,
	timeoutMs?: number,
}

export function uiLog(value: string, { logId, timeoutMs = 5000 }: uiLogOptions = {}) {
	let logParent = getLogElement()

	if(logId && logs.has(logId)) {
		const logEntry = logs.get(logId)
		clearTimeout(logEntry!.timeoutId)
		if(!logEntry) throw new Error(`logElement is ${logEntry}`)
		logEntry.element.textContent = value
		logEntry.timeoutId = setTimeout(() => {
			logEntry.element.remove()
			if(logId && logs.has(logId)) logs.delete(logId)
		}, timeoutMs);
		logs.set(logId, logEntry)
		return logId
	}

	const logElement = document.createElement('pre')
	logElement.style.margin = "0"
	logElement.textContent = value
	logParent.appendChild(logElement)
	logElement.scrollIntoView() //{behavior: "smooth"})

	const timeoutId = setTimeout(() => {
		logElement.remove()
		logs.delete(timeoutId)
	}, timeoutMs);

	if(logs.has(logId || timeoutId as number)) 
		throw new Error(`${timeoutId} already exists in logs`)

	logs.set(logId || timeoutId, {timeoutId: timeoutId, element: logElement});

	return timeoutId
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

