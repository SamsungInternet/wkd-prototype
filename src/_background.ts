import type { Message } from './messageTypes.js'

// FIXME: Clean up when a tab is closed.
const tabUrls = new Map<number, string>()
const queuedMessages = new Map<number, Message[]>()  // FIXME: needed?
const contentTabIds = new Map<number, chrome.runtime.Port>()

// FIXME somehow get this on to port.postMessage itself
function queueOrSendToTab(tabId: number, message: Message): void {
	const port = contentTabIds.get(tabId)
	if (port) {
		port.postMessage(message)
	} else if (queuedMessages.has(tabId)) {
		queuedMessages.get(tabId)?.push(message)
	} else {
		queuedMessages.set(tabId, [ message ])
	}
}

chrome.runtime.onConnect.addListener(port => {
	if (port.name === 'content') {
		if (port.sender?.tab?.id) {
			console.log(`ia: bkg: ${port.sender.tab.id} connected ${port.sender.tab.url}`)
			contentTabIds.set(port.sender.tab.id, port)
			attachListener(port)
			const messages = queuedMessages.get(port.sender.tab.id)
			if (messages) {
				for (const msg of messages) {
					console.log(`ia: bkg: posting queued message for ${port.sender.tab.id}`)
					port.postMessage(msg)
				}
				messages.length = 0
			}
		}
		port.onDisconnect.addListener(function() {
			if (port.sender?.tab?.id) {
				console.log(`ia: bkg: ${port.sender.tab.id} disconnected ${port.sender.tab.url}`)
				contentTabIds.delete(port.sender.tab.id)
			}
		})
	}
})

function attachListener(port: chrome.runtime.Port) {
	port.onMessage.addListener(message => {
		if (!message.name) return
		switch (message.name) {
			case 'set-badge':
				chrome.browserAction.setBadgeText({
					text: message.data ? String(message.data) : '',
					tabId: port.sender?.tab?.id
				})
				break
			default:
				console.log(`ia: bkg: got ${message.name} from ${port.sender?.tab?.id}`)
		}
	})
}

// TODO: How to support frames? - already done due to port approach?
// TODO: Can we use fetch in bkg script here?
chrome.tabs.onUpdated.addListener((tabId, changeInfo /* also: tab */) => {
	if (!changeInfo.url) return
	// NOTE: Guarding against 'loading' status (i.e. wanting only 'complete' doesn't work
	//       ('complete' events are sometimes not fired).
	const prevUrl = tabUrls.get(tabId) ?? {}
	if (prevUrl !== changeInfo.url) {
		console.log(`ia: bkg: TAB ${tabId}: URL changed`)
		tabUrls.set(tabId, changeInfo.url)
		queueOrSendToTab(tabId, { name: 'page-destinations' })
	}
})

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
	for (let i = 0; i < tabs.length; i++) {
		const tabId = tabs[i].id
		if (tabId) {
			chrome.tabs.executeScript(tabId, { file: 'content.js' })
		}
	}
})