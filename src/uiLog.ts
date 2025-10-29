
export function uiLog(value: string) {
	let logElement = document.getElementById('logger')

	if (!logElement) {
		logElement = document.createElement('div')
		logElement.id = 'logger'
		logElement.style.position = 'absolute'
		logElement.style.backdropFilter = "blur(10px)"
		logElement.style.maxHeight = '10rem'
		logElement.style.overflow = 'hidden'
		logElement.style.opacity = '0.7'

		document.body.appendChild(logElement)
	}

	if(logElement.children.length > 10)
		logElement.children[0].remove()

	const logEntry = document.createElement('pre')
	logEntry.style.margin = "0"
	logEntry.textContent = value
	logElement.appendChild(logEntry)
	logEntry.scrollIntoView() //{behavior: "smooth"})

	setTimeout(() => {
		logEntry.remove()
	}, 3000);
}
