import { isDestination } from './messageTypes.js'

import type { ChromeMessageCanBeAnything, DataMessageName, DataType, Destination } from './messageTypes.js'

type SiteDestinationRecord = {
	touched: number,
	destinations: Destination[]
}

const MAX_BYTES = 100_000
const ONE_DAY = 24 * 60 * 60 * 1000
const TEN_DAYS = ONE_DAY * 10

let gPort: chrome.runtime.Port
let gPopupOpen = false
let gWaitingToSendInfo = true
const gWkDestinations: Destination[] = []
const gPageDestinations: Destination[] = []

// Event handlers
// {{{

// NOTE: We don't check for undefined data in the *-destinations messages, as
//       only this script will send those messages _with_ data.
function portMessageHandler(message: ChromeMessageCanBeAnything) {
	if (!message.name) return
	switch (message.name) {
		case 'page-destinations':
			console.log('ia: content: got from port: page-destinations')
			getPageDestinations()
			badgeFoundDestinations()
			break
	}
}

function runtimeMessageHandler(message: ChromeMessageCanBeAnything) {
	console.log('ia: content: got', message)
	if (!message.name) return
	switch (message.name) {
		case 'popup-open':
			gPopupOpen = message.data
			if (gWaitingToSendInfo) {
				console.log('ia: content: popup is open: no info to send yet')
			} else {
				console.log('ia: content: popup is open: have info to send')
				sendInfo()
			}
			break
		case 'go-to':
			if (message.data === 'home') {  // FIXME: don't special-case?
				location.assign(new URL(location.origin))
			} else if (gWkDestinations.includes(message.data) || gPageDestinations.includes(message.data)) {
				location.assign(new URL(location.origin + '/.well-known/ia/' + message.data))
			} else {
				throw new Error(`ia: content: this site doesn't support a '${message.data}' destination`)
			}
	}
}

function visibilityHandler() {
	// FIXME: docs
	// NOTE: We have not been listening to messages (including the one about
	//       the popup's visibility) whilst invisible, so we ask the background
	//       script to update us.
	if (!gPort) {
		gPort = chrome.runtime.connect({ name: 'content' })
	}
	if (document.hidden) {
		gPort.onMessage.removeListener(portMessageHandler)
		chrome.runtime.onMessage.removeListener(runtimeMessageHandler)
		gPort.postMessage({ name: 'clear-badge' })
	} else {
		gPort.onMessage.addListener(portMessageHandler)
		chrome.runtime.onMessage.addListener(runtimeMessageHandler)
		badgeFoundDestinations()  // done on start-up and when the page is shown

		// In Firefox, the pop-up can be open as we move between tabs.
		// In Chrome (and Firefox? FIXME), the pop-up remains open when we remain on the same page.
		chrome.runtime.sendMessage({ name: 'popup-open' }, () => {
			if (chrome.runtime.lastError) {
				// noop
			}
		})
	}
}

// }}}

// Data processing
// {{{

// FIXME: check what's returned is destinations/ignore things that aren't.
function getWkDestinations() {
	chrome.storage.local.get(location.origin, result => {
		const record = result[location.origin]
		if (!isSiteDestinationRecord(record) || isOutOfDate(record)) {
			const url = new URL(location.origin + '/.well-known/ia')
			console.log(`ia: content: fetching ${url}`)
			fetch(url)
				.then(function(response) {
					if (response.status !== 200) {
						console.log('ia: content: fetch error: ' + response.status)
						storeDestinations({ touched: Date.now(), destinations: [] })
						return
					}
					// FIXME: ensure it's Destinations
					// TODO: https://github.com/microsoft/TypeScript/issues/26188 (not quite?)
					response.json().then(updateAndStoreDestinations)
				})
				.catch(function(err) {
					console.log('ia: content: fetch error:', err)
				})
		} else {
			console.log('ia: content: using cached results for', location.origin)
			updateAndStoreDestinations(record.destinations)  // update touched time
		}
	})
}

function isSiteDestinationRecord(thing: unknown): thing is SiteDestinationRecord {
	if (!thing || typeof thing !== 'object') return false
	if (!Object.hasOwn(thing, 'touched')) return false
	// @ts-expect-error https://github.com/microsoft/TypeScript/issues/44253
	if (thing.touched instanceof Date) return false
	if (!Object.hasOwn(thing, 'destinations')) return false
	// @ts-expect-error https://github.com/microsoft/TypeScript/issues/44253
	if (!Array.isArray(thing.destinations)) return false
	return true
}

// TODO: More intelligent cacheing
function isOutOfDate(record: SiteDestinationRecord): boolean {
	return record.touched < Date.now() - ONE_DAY || location.hostname === 'localhost'
}

function cleanUp(bytes: number) {
	const threshold = Date.now() - TEN_DAYS
	let removed = 0
	let kept = 0

	if (bytes < MAX_BYTES) return
	console.log('ia: content: cleanUp: storage bytes in use:', bytes)
	chrome.storage.local.get(items => {
		for (const [ site, info ] of Object.entries(items)) {
			if (info.touched < threshold) {
				chrome.storage.local.remove(site)
				removed += 1
			} else {
				kept += 1
			}
		}
		console.log('ia: content: cleanUp: removed:', removed, 'kept:', kept)
	})
}

function storeDestinations(record: SiteDestinationRecord) {
	chrome.storage.local.set({ [location.origin]: record }, () => {
		chrome.storage.local.getBytesInUse(cleanUp)
	})
}

function updateAndStoreDestinations(destinations: Destination[]) {
	gWkDestinations.length = 0
	gWkDestinations.push(...destinations)
	console.log('ia: content: well-known destinations:', gWkDestinations)
	badgeFoundDestinations()
	if (gWaitingToSendInfo) {
		if (gPopupOpen) {
			console.log('ia: content: was waiting to send; sending')
			sendInfo()
		}
		gWaitingToSendInfo = false
	}
	storeDestinations({ touched: Date.now(), destinations })
}

// FIXME: conflict with meaning of help
// FIXME: even the help link deep-links, right?
function getPageDestinations() {
	gPageDestinations.length = 0
	for (const el of document.querySelectorAll('body [rel]')) {
		for (const rel of el.getAttribute('rel')?.split(' ') ?? []) {
			if (isDestination(rel)) {
				gPageDestinations.push(rel)
			}
		}
	}
	console.log('ia: content: destination signposted on this page:', gPageDestinations)
}

function badgeFoundDestinations() {
	gPort.postMessage({
		name: 'set-badge',
		data: gWkDestinations.length + gPageDestinations.length
	})
}

function truncate(text: string): string {
	const maxlength = 30
	return (text.length > maxlength)
		? text.slice(0, maxlength - 1) + '…'
		: text
}

// }}}

// Messaging
// {{{

function sendInfo() {
	if (!gPopupOpen) return
	send('page-name', truncate(document.title))
	send('wk-destinations', gWkDestinations)
	send('page-destinations', gPageDestinations)
}

// NOTE: Callers need to check document is visible, and whether popup is open
function send<Name extends DataMessageName>(name: Name, data: DataType<Name>): void {
	chrome.runtime.sendMessage({ name, data })
}

// }}}

// Start-up
// {{{

function main() {
	console.log('ia: content: starting up')
	getWkDestinations()
	getPageDestinations()

	// This is all wrapped in checking the 'on' setting, because doing so here
	// negates the need to unnecessarily get the setting each time page
	// visibility changes.
	document.addEventListener('visibilitychange', visibilityHandler)

	// Firefox auto-injects content scripts to existing tabs
	if (!document.hidden) {
		visibilityHandler()
		sendInfo()
	}
}

main()

// }}}
