const express = require('express')
const compression = require('compression')
const { program } = require('commander')
const path = require('path')
const fs = require('fs')

const DEFAULT_PORT = 3000

program
   .option('--proxy-prefix <prefix>', 'URL prefix for API routes (e.g. /mnp-timeline)')
   .option('--port <number>', 'server port number', String(DEFAULT_PORT))
   .parse()

const opts = program.opts()
const proxyPrefix = opts.proxyPrefix || ''
const PORT = parseInt(opts.port, 10)
const DATA_PATH = path.join(__dirname, '..', 'data', 'mnp-timeline.json')

const app = express()
app.use(compression())

const VERSION_PATH = path.join(__dirname, '..', 'data', 'version.json')

console.log('Loading mnp-timeline.json...')
const raw = fs.readFileSync(DATA_PATH, 'utf8')
const data = JSON.parse(raw)
const players = data.players || {}
const buildDate = (data.metadata && data.metadata.buildDate) || 'unknown'
console.log(`Loaded ${data.seasons.length} seasons, ${Object.keys(players).length} players`)

let buildVersion = 'unknown'
try {
   const versionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'))
   buildVersion = versionData.version || 'unknown'
   console.log(`App version: ${buildVersion}`)
} catch {
   console.warn('Warning: could not read version.json')
}

const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60

function resolvePlayerNames(matches) {
   return matches.map(match => ({
      ...match,
      rounds: match.rounds.map(round => ({
         ...round,
         machines: round.machines.map(machine => ({
            ...machine,
            players: machine.players.map(p => ({
               ...p,
               name: players[p.id] || (p.id ? p.id.slice(-7) : p.id)
            }))
         }))
      }))
   }))
}

const indexTemplate = fs.readFileSync(
   path.join(__dirname, 'public', 'index.html'), 'utf8'
)
const indexHtml = indexTemplate
   .replace(/%%BUILD_VERSION%%/g, encodeURIComponent(buildVersion))
   .replace(/%%PROXY_PREFIX%%/g, proxyPrefix)

app.get('/', (req, res) => {
   res.set('Cache-Control', 'no-cache')
   res.type('html').send(indexHtml)
})

app.use(express.static(path.join(__dirname, 'public'), {
   maxAge: ONE_WEEK_SECONDS * 1000
}))

app.get('/api/version', (req, res) => {
   res.set('Cache-Control', 'no-cache')
   res.json({ buildDate })
})

app.get('/api/filters', (req, res) => {
   res.set('Cache-Control', `public, max-age=${ONE_WEEK_SECONDS}`)
   const seasonNum = parseInt(req.query.season, 10)
   const weekNum = parseInt(req.query.week, 10)

   const seasons = data.seasons.map(s => s.season).sort((a, b) => a - b)

   let weeks = []
   let venues = []

   if (!isNaN(seasonNum)) {
      const season = data.seasons.find(s => s.season === seasonNum)
      if (season) {
         weeks = season.weeks.map(w => w.week).sort((a, b) => a - b)

         if (!isNaN(weekNum)) {
            const week = season.weeks.find(w => w.week === weekNum)
            if (week) {
               const venueSet = new Set(week.matches.map(m => m.venue).filter(Boolean))
               venues = [...venueSet].sort()
            }
         }
      }
   }

   res.json({ seasons, weeks, venues })
})

app.get('/api/matches', (req, res) => {
   res.set('Cache-Control', `public, max-age=${ONE_WEEK_SECONDS}`)
   const seasonNum = parseInt(req.query.season, 10)
   const weekNum = parseInt(req.query.week, 10)
   const venue = req.query.venue

   if (isNaN(seasonNum) || isNaN(weekNum)) {
      return res.status(400).json({ error: 'season and week are required numeric parameters' })
   }

   const season = data.seasons.find(s => s.season === seasonNum)
   if (!season) {
      return res.status(404).json({ error: `Season ${seasonNum} not found` })
   }

   const week = season.weeks.find(w => w.week === weekNum)
   if (!week) {
      return res.status(404).json({ error: `Week ${weekNum} not found in season ${seasonNum}` })
   }

   let matches = week.matches
   if (venue) {
      matches = matches.filter(m => m.venue === venue)
   }

   res.json(resolvePlayerNames(matches))
})

app.listen(PORT, () => {
   console.log(`Server running at http://localhost:${PORT}`)
   console.log(`Try: http://localhost:${PORT}?season=23&week=3&venue=T4B`)
})
