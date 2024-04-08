import express from 'express'
const app = express()
const port = 3000

type urlMap = {
	[key: string]: string
}

const shoppingDestinationUrls: urlMap = {
	'home': '/',
	'accessibility-statement': '/accessibility',
	'contact': '/contact',
	'help': '/help',
	'log-in': '/sign-in',
	'products': '/products'
} as const

function main() {
	let siteName: string
	let destinationUrls: urlMap

	switch (process.argv.at(-1)) {
		case 'shopping':
			siteName = 'shopping'
			destinationUrls = shoppingDestinationUrls
			break
		default:
			console.log('Usage: app.ts <site>\n       Valid sites are: shopping')
			return
	}
	
	app.use(express.static(`demo-site-${siteName}/public`))

	app.get('/.well-known/ia', (req, res) => {
		res.send(Object.keys(destinationUrls))
	})

	for (const [ dest, url ] of Object.entries(destinationUrls)) {
		app.get(`/.well-known/ia/${dest}`, (req, res) => {
			res.redirect(url)
		})
	}

	app.listen(port, () => {
		console.log(`Example app (${siteName}) listening on port ${port}`)
	})
}

main()
