import type { Message } from './messageTypes.js'

export function sendToActiveTab(message: Message): void {
	chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
		if (tabs[0].id) {
			chrome.tabs.sendMessage(tabs[0].id, message)
		}
	})
}
