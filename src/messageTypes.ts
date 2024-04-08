/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type ChromeMessageCanBeAnything = any

const DESTINATIONS = [
	'accessibility-statement',
	'change-password',
	'contact',
	'help',  // FIXME: this is already a taken @rel value
	'home',
	'products',
	'log-in',
	'search'
] as const

export type Destination = typeof DESTINATIONS[number]

export function isDestination(candidate: string): candidate is Destination {
	return DESTINATIONS.includes(candidate as Destination)
}

// FIXME: There are no more messages with optional data.
export type Message =
	{ name: 'clear-badge' } |
	{ name: 'popup-open', data?: boolean } |
	{ name: 'page-name', data: string } |
	{ name: 'wk-destinations', data: Destination[] } |
	{ name: 'page-destinations', data?: Destination[] } |
	{ name: 'go-to', data: Destination }

export type DataMessageName<M = Message> =
	M extends { name: string }
		? M extends { data?: unknown } ? M['name'] : never
		: never

export type DataType<Name extends Message['name'], M = Message> =
	M extends { name: Name, data?: unknown } ? M['data'] : never
