
export function uiLog(value: string) {
	let logElement = document.getElementById('logger')

	if (!logElement) {
		logElement = document.createElement('pre')
		logElement.id = 'logger'
		logElement.style.position = 'absolute'
		logElement.style.backdropFilter = "blur(10px)"
		document.body.appendChild(logElement)
	}

	logElement.textContent += value + "\n"
}
