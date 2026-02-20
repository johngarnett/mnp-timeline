#!/usr/bin/env node

// Copyright 2026 John Garnett

const fs = require('fs')
const path = require('path')

let POSTS_DIR = path.join(__dirname, 'data', 'posts')
const DEFAULT_ARCHIVE_DIR = path.join(__dirname, 'mnp-data-archive')
let ARCHIVE_DIR = DEFAULT_ARCHIVE_DIR
const SEATTLE_TZ = 'America/Los_Angeles'

// Path patterns for valid record types
const MATCH_PATH_RE = /^\/matches\/mnp-(\d+)-(\w+)-([A-Z]+)-([A-Z]+)\/(picks|confirm|ready|players\/add|players\/remove|venue\/add|venue\/remove)$/
const GAME_PATH_RE = /^\/games\/mnp-(\d+)-(\w+)-([A-Z]+)-([A-Z]+)\.(\d+)\.(\d+)\/report$/
const TEAM_PATH_RE = /^\/teams\/([A-Z0-9]+)\/roster\/(add|remove)$/
const VENUE_PATH_RE = /^\/venues\/([A-Z0-9]+)\/(add|remove)$/
const MACHINE_PATH_RE = /^\/machines$/
const SCRIMMAGE_WEEK = 'S'
const IGNORED_SEASONS = new Set(['13'])

// Offset constants for timeline duration calculations
const RESPONDING_START_OFFSET_MS = 60 * 1000
const GAME_START_OFFSET_MS = 60 * 1000

// Round player counts
const FOUR_PLAYER_ROUNDS = new Set([1, 4])
const TWO_PLAYER_ROUNDS = new Set([2, 3])

function playerCountForRound(round) {
   if (FOUR_PLAYER_ROUNDS.has(round)) return 4
   if (TWO_PLAYER_ROUNDS.has(round)) return 2
   return null
}

function formatSeattleTime(epochMs) {
   return new Date(epochMs).toLocaleString('en-US', { timeZone: SEATTLE_TZ })
}

function ensurePath(obj, keys) {
   let current = obj
   for (const key of keys) {
      if (!(key in current)) {
         current[key] = {}
      }
      current = current[key]
   }
   return current
}

function loadPlayers() {
   const csvPath = path.join(ARCHIVE_DIR, 'players.csv')
   const players = {}
   try {
      const raw = fs.readFileSync(csvPath, 'utf8')
      const lines = raw.split('\n')
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
         const line = lines[i].trim()
         if (!line) continue
         // Parse CSV: "name","key","created_at","created_GMT","verified"
         const match = line.match(/^"([^"]*)"(?:,"([^"]*)")?/)
         if (match) {
            const name = match[1]
            const key = match[2]
            if (key && name) {
               players[key] = name
            }
         }
      }
   } catch (e) {
      console.warn('Warning: could not read players.csv:', csvPath)
   }
   return players
}

function loadMatchVenues(players) {
   const venues = {}
   let seasonDirs
   try {
      seasonDirs = fs.readdirSync(ARCHIVE_DIR).filter(d => d.startsWith('season-'))
   } catch (e) {
      console.warn('Warning: could not read archive directory:', ARCHIVE_DIR)
      return venues
   }
   for (const seasonDir of seasonDirs) {
      const matchesDir = path.join(ARCHIVE_DIR, seasonDir, 'matches')
      if (!fs.existsSync(matchesDir)) continue
      const files = fs.readdirSync(matchesDir).filter(f => f.endsWith('.json'))
      for (const file of files) {
         try {
            const raw = fs.readFileSync(path.join(matchesDir, file), 'utf8')
            const match = JSON.parse(raw)
            if (match.venue && match.venue.key) {
               venues[match.key] = match.venue.key
            }
            for (const side of [match.away, match.home]) {
               if (side && Array.isArray(side.lineup)) {
                  for (const entry of side.lineup) {
                     if (entry.key && entry.name && !players[entry.key]) {
                        players[entry.key] = entry.name
                     }
                  }
               }
            }
         } catch (e) {
            // skip unreadable files
         }
      }
   }
   return venues
}

function loadPosts(opts = {}) {
   if (opts.archiveDir) ARCHIVE_DIR = opts.archiveDir
   if (opts.postsDir) POSTS_DIR = opts.postsDir
   const players = loadPlayers()
   const data = {
      seasons: {},
      teams: {},
      venues: {},
      machines: {},
      players,
      matchVenues: loadMatchVenues(players),
      skipped: { noise: 0, parseErrors: 0, scrimmages: 0, emptyReports: 0 }
   }

   const files = fs.readdirSync(POSTS_DIR)
   let processed = 0

   for (const file of files) {
      const filePath = path.join(POSTS_DIR, file)

      let record
      try {
         const raw = fs.readFileSync(filePath, 'utf8')
         record = JSON.parse(raw)
      } catch (err) {
         data.skipped.parseErrors++
         continue
      }

      const recordPath = record.path
      const body = record.body || {}
      const when = record.when
      const userId = record.user_id
      const ukey = record.ukey
      const whenSeattle = formatSeattleTime(when)

      const meta = { path: recordPath, when, whenSeattle, userId, ukey, sourceFile: file }

      // Try match path
      let m = recordPath.match(MATCH_PATH_RE)
      if (m) {
         const [, season, week, away, home, operation] = m
         if (week === SCRIMMAGE_WEEK || IGNORED_SEASONS.has(season)) {
            data.skipped.scrimmages++
            continue
         }
         const matchupKey = `${away}-${home}`

         const matchup = ensurePath(data.seasons, [season, week, matchupKey])
         if (!matchup.away) matchup.away = away
         if (!matchup.home) matchup.home = home
         if (!matchup.events) matchup.events = []

         const OPERATION_TYPES = {
            'picks': 'picks',
            'confirm': 'confirm',
            'ready': 'ready',
            'players/add': 'playerAdd',
            'players/remove': 'playerRemove',
            'venue/add': 'venueAdd',
            'venue/remove': 'venueRemove'
         }

         const type = OPERATION_TYPES[operation]
         switch (operation) {
            case 'picks': {
               const round = body.round
               if (round) {
                  if (body.state === 'picking') {
                     matchup.events.push({
                        type: 'picking',
                        round: parseInt(round),
                        playerCount: playerCountForRound(parseInt(round)),
                        machines: extractMachines(body),
                        ...meta
                     })
                  } else {
                     matchup.events.push({
                        type: 'responding',
                        round: parseInt(round),
                        playerCount: playerCountForRound(parseInt(round)),
                        assignments: extractAssignments(body),
                        ...meta
                     })
                  }
               }
               break
            }
            case 'confirm': {
               const CONFIRM_OPPONENT = 'CONFIRM OPPONENT'
               if (body.left && body.left.trim() === CONFIRM_OPPONENT) {
                  matchup.events.push({ type: 'confirmOpponent', side: 'left', ...meta })
               } else if (body.right && body.right.trim() === CONFIRM_OPPONENT) {
                  matchup.events.push({ type: 'confirmOpponent', side: 'right', ...meta })
               } else if (body.left) {
                  matchup.events.push({ type: 'confirm', side: 'left', ...meta })
               } else if (body.right) {
                  matchup.events.push({ type: 'confirm', side: 'right', ...meta })
               }
               break
            }
            case 'ready': {
               matchup.events.push({ type, team: body.team, ...meta })
               break
            }
            case 'players/add': {
               matchup.events.push({ type, team: body.team, name: body.name, ...meta })
               break
            }
            case 'players/remove': {
               matchup.events.push({ type, key: body.key, ...meta })
               break
            }
            case 'venue/add': {
               matchup.events.push({ type, mkey: body.mkey, ...meta })
               break
            }
            case 'venue/remove': {
               matchup.events.push({ type, mkey: body.mkey, ...meta })
               break
            }
         }
         processed++
         continue
      }

      // Try game path
      m = recordPath.match(GAME_PATH_RE)
      if (m) {
         const [, season, week, away, home, round, gameNum] = m
         if (week === SCRIMMAGE_WEEK || IGNORED_SEASONS.has(season)) {
            data.skipped.scrimmages++
            continue
         }
         const matchupKey = `${away}-${home}`

         const matchup = ensurePath(data.seasons, [season, week, matchupKey])
         if (!matchup.away) matchup.away = away
         if (!matchup.home) matchup.home = home
         if (!matchup.events) matchup.events = []

         const scores = extractScores(body)
         if (Object.keys(scores).length === 0) {
            data.skipped.emptyReports++
            continue
         }

         const reportEvent = {
            type: 'report',
            round: parseInt(round),
            game: parseInt(gameNum),
            playerCount: playerCountForRound(parseInt(round)),
            scores,
            ...meta
         }
         if (body.photo_data) reportEvent.photoId = body.photo_data
         matchup.events.push(reportEvent)
         processed++
         continue
      }

      // Try team path
      m = recordPath.match(TEAM_PATH_RE)
      if (m) {
         const [, teamCode, operation] = m
         if (!data.teams[teamCode]) {
            data.teams[teamCode] = { rosterAdds: [], rosterRemoves: [] }
         }
         if (operation === 'add') {
            data.teams[teamCode].rosterAdds.push({
               name: body.name,
               role: body.role,
               ...meta
            })
         } else {
            data.teams[teamCode].rosterRemoves.push({
               key: body.key,
               ...meta
            })
         }
         processed++
         continue
      }

      // Try venue path
      m = recordPath.match(VENUE_PATH_RE)
      if (m) {
         const [, venueCode, operation] = m
         if (!data.venues[venueCode]) {
            data.venues[venueCode] = { machineAdds: [], machineRemoves: [] }
         }
         if (operation === 'add') {
            data.venues[venueCode].machineAdds.push({
               mkey: body.mkey,
               ...meta
            })
         } else {
            data.venues[venueCode].machineRemoves.push({
               mkey: body.mkey,
               ...meta
            })
         }
         processed++
         continue
      }

      // Try machine path
      m = recordPath.match(MACHINE_PATH_RE)
      if (m) {
         const mkey = body.mkey
         const name = body.name
         if (mkey && name) {
            data.machines[mkey] = { name, ...meta }
         }
         processed++
         continue
      }

      // Everything else is noise (web scanner probes, exploit attempts, etc.)
      data.skipped.noise++
   }

   return { data, processed, totalFiles: files.length }
}

function extractMachines(body) {
   const machines = []
   let i = 1
   while (body[`machine.${i}`]) {
      const players = []
      for (let p = 1; p <= 4; p++) {
         const key = `player_${p}.${i}`
         if (body[key]) {
            players.push({ player: p, id: body[key] })
         }
      }
      machines.push({ machine: i, name: body[`machine.${i}`], players })
      i++
   }
   return machines
}

function extractAssignments(body) {
   const byGame = {}
   for (const [key, value] of Object.entries(body)) {
      const m = key.match(/^player_(\d+)\.(\d+)$/)
      if (m) {
         const position = parseInt(m[1])
         const game = parseInt(m[2])
         if (!byGame[game]) byGame[game] = []
         byGame[game].push({ player: position, id: value })
      }
   }
   return Object.keys(byGame).sort((a, b) => a - b).map(game => ({
      machine: parseInt(game),
      players: byGame[game].sort((a, b) => a.player - b.player)
   }))
}

function extractScores(body) {
   const scores = {}
   for (let i = 1; i <= 4; i++) {
      const key = `score_${i}`
      if (body[key] !== undefined) {
         scores[i] = body[key]
      }
   }
   return scores
}

function printSummary(result) {
   const { data, processed, totalFiles } = result
   const seasons = Object.keys(data.seasons).sort((a, b) => a - b)

   console.log(`\n=== MNP Replay Data Summary ===`)
   console.log(`Total files: ${totalFiles}`)
   console.log(`Processed: ${processed}`)
   console.log(`Skipped - noise: ${data.skipped.noise}, scrimmages: ${data.skipped.scrimmages}, empty reports: ${data.skipped.emptyReports}, parse errors: ${data.skipped.parseErrors}`)
   console.log(`Seasons: ${seasons.join(', ')}`)
   console.log(`Teams: ${Object.keys(data.teams).sort().join(', ')}`)
   console.log(`Venues: ${Object.keys(data.venues).sort().join(', ')}`)
   console.log(`Players: ${Object.keys(data.players).length} loaded`)
   console.log(`Machines: ${Object.keys(data.machines).length} defined`)
   console.log(`Match venues loaded: ${Object.keys(data.matchVenues).length}`)

   console.log(`\n--- Season Breakdown ---`)
   for (const season of seasons) {
      const weeks = Object.keys(data.seasons[season]).sort(numericSort)
      const matchupCount = weeks.reduce((sum, w) => sum + Object.keys(data.seasons[season][w]).length, 0)
      console.log(`  Season ${season}: ${weeks.length} weeks, ${matchupCount} matchups (weeks: ${weeks.join(', ')})`)
   }
}

function numericSort(a, b) {
   const aNum = parseInt(a)
   const bNum = parseInt(b)
   if (isNaN(aNum) && isNaN(bNum)) return a.localeCompare(b)
   if (isNaN(aNum)) return 1
   if (isNaN(bNum)) return -1
   return aNum - bNum
}

function buildRounds(events) {
   // Collect picking events per round in chronological order
   const pickingByRound = {}
   // Collect responding events per round in chronological order
   const respondingByRound = {}
   // First report per round+game sets the timestamp; later reports update scores
   const gameReport = {}

   for (const e of events) {
      if (e.type === 'picking') {
         if (!pickingByRound[e.round]) pickingByRound[e.round] = []
         pickingByRound[e.round].push(e)
      } else if (e.type === 'responding') {
         if (!respondingByRound[e.round]) respondingByRound[e.round] = []
         respondingByRound[e.round].push(e)
      } else if (e.type === 'report') {
         const key = `${e.round}.${e.game}`
         const existing = gameReport[key]
         if (!existing) {
            gameReport[key] = { ...e, updates: [] }
         } else {
            existing.updates.push({ post: e.sourceFile, epoch: e.when, uid: e.ukey })
            Object.assign(existing.scores, e.scores)
            if (e.photoId) existing.photoId = e.photoId
         }
      }
   }

   // Sort each group chronologically
   for (const r in pickingByRound) pickingByRound[r].sort((a, b) => a.when - b.when)
   for (const r in respondingByRound) respondingByRound[r].sort((a, b) => a.when - b.when)

   // Merge picking events: start with first, layer on new info from subsequent
   function mergePicking(events) {
      if (!events || events.length === 0) return null
      const base = { ...events[0], machines: events[0].machines.map(m => ({
         ...m, players: [...m.players]
      }))}
      for (let i = 1; i < events.length; i++) {
         const update = events[i]
         for (const um of update.machines) {
            const bm = base.machines.find(m => m.machine === um.machine)
            if (bm) {
               // Update name if changed
               if (um.name !== bm.name) bm.name = um.name
               // Add any new players
               for (const up of um.players) {
                  const existing = bm.players.find(p => p.player === up.player)
                  if (!existing) {
                     bm.players.push(up)
                  } else if (existing.id !== up.id) {
                     existing.id = up.id
                  }
               }
            } else {
               base.machines.push({ ...um, players: [...um.players] })
            }
         }
      }
      return base
   }

   // Merge responding events: start with first, layer on new info from subsequent
   function mergeResponding(events) {
      if (!events || events.length === 0) return null
      const base = { ...events[0], assignments: events[0].assignments.map(a => ({
         ...a, players: [...a.players]
      }))}
      for (let i = 1; i < events.length; i++) {
         const update = events[i]
         for (const ua of update.assignments) {
            const ba = base.assignments.find(a => a.machine === ua.machine)
            if (ba) {
               for (const up of ua.players) {
                  const existing = ba.players.find(p => p.player === up.player)
                  if (!existing) {
                     ba.players.push(up)
                  } else if (existing.id !== up.id) {
                     existing.id = up.id
                  }
               }
            } else {
               base.assignments.push({ ...ua, players: [...ua.players] })
            }
         }
      }
      return base
   }

   // Collect all round numbers
   const roundNums = new Set()
   Object.keys(pickingByRound).forEach(r => roundNums.add(parseInt(r)))
   Object.keys(respondingByRound).forEach(r => roundNums.add(parseInt(r)))
   Object.values(gameReport).forEach(r => roundNums.add(r.round))

   return [...roundNums].sort((a, b) => a - b).map(roundNum => {
      const picking = mergePicking(pickingByRound[roundNum])
      const responding = mergeResponding(respondingByRound[roundNum])

      // Build machines from picking data
      const machineList = picking ? picking.machines : []
      const machines = machineList.map(m => {
         // Merge responding players into picking players
         const allPlayers = [...m.players]
         if (responding) {
            const respMachine = responding.assignments.find(a => a.machine === m.machine)
            if (respMachine) {
               for (const rp of respMachine.players) {
                  if (!allPlayers.find(p => p.player === rp.player)) {
                     allPlayers.push(rp)
                  }
               }
            }
         }
         allPlayers.sort((a, b) => a.player - b.player)

         // Merge scores from report
         const report = gameReport[`${roundNum}.${m.machine}`]
         const players = allPlayers.map(p => ({
            player: p.player,
            id: p.id,
            score: report && report.scores[p.player] ? report.scores[p.player] : null
         }))

         const result = {
            machine: m.machine,
            name: m.name
         }
         if (report) {
            result.reported = { epoch: report.when, local: report.whenSeattle }
            result.post = report.sourceFile
            result.uid = report.ukey
            if (report.photoId) result.photoId = report.photoId
            if (report.updates.length > 0) result.updates = report.updates
            // Game duration: from game start to report time
            const gameStart = responding
               ? responding.when + GAME_START_OFFSET_MS
               : report.when
            if (gameStart < report.when) {
               result.duration = report.when - gameStart
            }
         }
         result.players = players

         return result
      })

      const round = { round: roundNum }
      if (picking) {
         round.picking = { epoch: picking.when, local: picking.whenSeattle, uid: picking.ukey }
      }
      if (responding) {
         round.responding = { epoch: responding.when, local: responding.whenSeattle, uid: responding.ukey }
         if (picking) {
            round.responding.duration = responding.when - (picking.when + RESPONDING_START_OFFSET_MS)
         }
      }
      round.machines = machines

      return round
   })
}

function toArrays(data) {
   const seasons = Object.keys(data.seasons).sort(numericSort).map(seasonKey => {
      const seasonObj = data.seasons[seasonKey]

      const weeks = Object.keys(seasonObj).sort(numericSort).map(weekKey => {
         const weekObj = seasonObj[weekKey]

         const matches = Object.keys(weekObj).sort().map(matchupKey => {
            const matchObj = weekObj[matchupKey]
            const { away, home, events } = matchObj

            const sortedEvents = (events || []).sort((a, b) => a.when - b.when)
            const rounds = buildRounds(sortedEvents)

            // confirmOpponent = lineup confirmation (match-level)
            const confirmOpponentLeft = sortedEvents.find(e => e.type === 'confirmOpponent' && e.side === 'left')
            const confirmOpponentRight = sortedEvents.find(e => e.type === 'confirmOpponent' && e.side === 'right')

            // confirm = score confirmation (round-level), assign by picking time
            const scoreConfirmLeftEvents = sortedEvents.filter(e => e.type === 'confirm' && e.side === 'left')
            const scoreConfirmRightEvents = sortedEvents.filter(e => e.type === 'confirm' && e.side === 'right')

            function assignConfirmToRound(confirmEvent) {
               if (!confirmEvent || rounds.length === 0) return
               for (let i = rounds.length - 1; i >= 0; i--) {
                  const r = rounds[i]
                  if (r.picking && confirmEvent.when >= r.picking.epoch) {
                     return r
                  }
               }
               return rounds[0]
            }

            for (const ce of scoreConfirmLeftEvents) {
               const r = assignConfirmToRound(ce)
               if (r && !r.confirmLeft) {
                  r.confirmLeft = { epoch: ce.when, local: ce.whenSeattle, uid: ce.ukey }
               }
            }
            for (const ce of scoreConfirmRightEvents) {
               const r = assignConfirmToRound(ce)
               if (r && !r.confirmRight) {
                  r.confirmRight = { epoch: ce.when, local: ce.whenSeattle, uid: ce.ukey }
               }
            }

            // Compute picking durations now that confirmations are assigned
            for (let i = 0; i < rounds.length; i++) {
               const r = rounds[i]
               if (!r.picking) continue
               // R1: anchor is latest lineup confirmation; R2+: latest score confirmation from previous round
               let anchorEpoch = null
               if (i === 0) {
                  const epochs = []
                  if (confirmOpponentLeft) epochs.push(confirmOpponentLeft.when)
                  if (confirmOpponentRight) epochs.push(confirmOpponentRight.when)
                  if (epochs.length > 0) anchorEpoch = Math.max(...epochs)
               } else {
                  const prev = rounds[i - 1]
                  const epochs = []
                  if (prev.confirmLeft) epochs.push(prev.confirmLeft.epoch)
                  if (prev.confirmRight) epochs.push(prev.confirmRight.epoch)
                  if (epochs.length > 0) anchorEpoch = Math.max(...epochs)
               }
               if (anchorEpoch !== null) {
                  const pickStart = anchorEpoch + RESPONDING_START_OFFSET_MS
                  if (pickStart < r.picking.epoch) {
                     r.picking.duration = r.picking.epoch - pickStart
                  }
               }
            }

            const filteredEvents = sortedEvents
               .filter(e => e.type !== 'report' && e.type !== 'picking' && e.type !== 'responding'
                  && e.type !== 'confirmOpponent' && e.type !== 'confirm')

            const archiveKey = `mnp-${seasonKey}-${weekKey}-${away}-${home}`
            const venue = data.matchVenues[archiveKey]

            const match = {
               matchup: matchupKey,
               away,
               home
            }
            if (venue) {
               match.venue = venue
            }
            if (confirmOpponentLeft) {
               match.confirmLeft = { epoch: confirmOpponentLeft.when, local: confirmOpponentLeft.whenSeattle, uid: confirmOpponentLeft.ukey }
            }
            if (confirmOpponentRight) {
               match.confirmRight = { epoch: confirmOpponentRight.when, local: confirmOpponentRight.whenSeattle, uid: confirmOpponentRight.ukey }
            }
            match.rounds = rounds
            match.events = filteredEvents

            return match
         })

         return { week: isNaN(parseInt(weekKey)) ? weekKey : parseInt(weekKey), matches }
      })

      return { season: parseInt(seasonKey), weeks }
   })

   return {
      seasons,
      players: data.players,
      teams: data.teams,
      venues: data.venues,
      machines: data.machines,
      skipped: data.skipped
   }
}

module.exports = {
   loadPosts,
   printSummary,
   toArrays,
   playerCountForRound,
   ensurePath,
   extractMachines,
   extractAssignments,
   extractScores,
   numericSort,
   buildRounds,
   formatSeattleTime
}
