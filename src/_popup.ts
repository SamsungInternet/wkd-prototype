import { sendToActiveTab } from './helpers.js'

import type { Destination } from './messageTypes.js'

type DestinationTranslation = {
	[K in Destination]: string
}

const translations = {
	'accessibility-statement': '♿ Accessibility statement',
	'change-password': '🔑 Change password',
	'contact': '☎️  Contact',
	'help': '❓ Help',
	'home': '🏡 Home',
	'log-in': '🔓 Log in',
	'products': '🛒 Products',
	'search': '🔎 Search'
} as const satisfies DestinationTranslation

chrome.runtime.onMessage.addListener(message => {
	switch (message.name) {
		case 'page-name':
			document.getElementById('page-name').innerText = message.data
			break
		case 'wk-destinations':
		case 'page-destinations':
			updateDestinations(message.name, message.data)
			break
		case 'popup-open':
			// In Firefox, the pop-up may remain open when moving between tabs.
			sendToActiveTab({ name: 'popup-open', data: true })
			break
		default:
			console.log(`ia: popup: got unknown message '${message.name}': ${message}`)
	}
})

function updateDestinations(kind: 'wk-destinations' | 'page-destinations', destinations: Destination[]) {
	if (kind === 'page-destinations') return
	const group = document.getElementById(kind)
	if (!group) throw new Error(`ia: popup: missing element '${kind}'`)
	const newDestinations = []
	for (const dest of destinations) {
		const btn = document.createElement('button')
		btn.append(translations[dest])
		btn.addEventListener('click', () => {
			sendToActiveTab({ name: 'go-to', data: dest })
		})
		newDestinations.push(btn)
	}
	group.replaceChildren(...newDestinations)
	// TODO: set hidden on desc
}

document.addEventListener('DOMContentLoaded', function() {
	sendToActiveTab({ name: 'popup-open', data: true })
})
