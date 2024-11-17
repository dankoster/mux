
const pluralize = (strings: TemplateStringsArray, value: number) => `${strings[0]}${value}${strings[1]}${value != 1 ? 's' : ''}`

export function age(date: string | number | Date, ageSuffix?: string) {
	const d = new Date(date)
	const value = d.valueOf()
	const now = Date.now()

	const format = (age: string) => [age, ageSuffix].join(' ')

	const ageInSeconds = Math.round((now - value) / 1000)
	if (ageInSeconds <= 60)
		return format(pluralize`${ageInSeconds} second`)

	const ageInMinutes = Math.round(ageInSeconds / 60)
	if (ageInMinutes < 60)
		return format(pluralize`${ageInMinutes} minute`)

	const ageInHours = Math.round(ageInMinutes / 60)
	if (ageInHours < 48)
		return format(pluralize`${ageInHours} hour`)

	const ageInDays = Math.round(ageInHours / 24)
	if (ageInDays <= 365)
		return format(pluralize`${ageInDays} day`)

	return d.toLocaleDateString()
}

export function ageTimestamp(timestamp: number) {
	const date = new Date(timestamp)
	const value = date.valueOf()
	const now = Date.now()

	const ageInSeconds = Math.round((now - value) / 1000)
	if (ageInSeconds <= 60)
		return `${shortTime(timestamp)} (now)`

	const ageInMinutes = Math.round(ageInSeconds / 60)
	if (ageInMinutes < 60)
		return `${shortTime(timestamp)} (${pluralize`${ageInMinutes} minute`} ago)`

	const ageInHours = Math.round(ageInMinutes / 60)
	if (ageInHours < 24)
		return `${shortTime(timestamp)} (${pluralize`${ageInHours} hour`} ago)`

	const ageInDays = Math.round(ageInHours / 24)
	if (ageInHours < 48)
		return `${shortTime(timestamp)} Yesterday`

	return `${shortTime(timestamp)} ${date.toLocaleDateString("en-GB", {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
	})} (${pluralize`${ageInDays} day`} ago)`
}

export function shortTime(timestamp: number) {
	return new Date(timestamp).toLocaleTimeString([], { timeStyle: 'short' })
}

export function diffTime(timestamp: number, prevTimestamp: number, minimumMinutes: number = 5) {
	const ms = timestamp - prevTimestamp
	const min = ms / (1000 * 60)

	if(!min || min < minimumMinutes)
		return 

	if(min < 60) 
		return pluralize`${Math.round(min)} minute`

	const hr = min / 60
	if(hr < 24)
		return pluralize`${Math.round(hr)} hour`

	const days = hr / 24
	return pluralize`${Math.round(days)} day`
}