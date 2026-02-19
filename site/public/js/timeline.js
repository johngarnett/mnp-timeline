// Copyright 2026 John Garnett

const MNP_MATCH_URL_BASE = 'https://mondaynightpinball.com/matches/mnp'
const TIMELINE_PADDING_MS = 5 * 60 * 1000
const EVENT_MARKER_DURATION_MS = 30 * 1000
const DEFAULT_SEASON = '23'
const DEFAULT_WEEK = '3'
const DEFAULT_VENUE = 'T4B'

let timeline = null
let dataVersion = ''

const seasonEl = document.getElementById('season')
const weekEl = document.getElementById('week')
const venueEl = document.getElementById('venue')

function populateSelect(el, values, defaultVal) {
   el.innerHTML = ''
   values.forEach(v => {
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = v
      el.appendChild(opt)
   })
   if (defaultVal && values.map(String).includes(String(defaultVal))) {
      el.value = defaultVal
   }
}

async function fetchVersion() {
   const res = await fetch(`${API_PREFIX}/api/version`)
   const { buildDate } = await res.json()
   dataVersion = buildDate
}

async function fetchFilters(opts = {}) {
   const params = new URLSearchParams()
   if (opts.season) params.set('season', opts.season)
   if (opts.week) params.set('week', opts.week)
   if (dataVersion) params.set('v', dataVersion)
   const res = await fetch(`${API_PREFIX}/api/filters?${params}`)
   return res.json()
}

async function loadSeasons() {
   const { seasons } = await fetchFilters()
   populateSelect(seasonEl, seasons, DEFAULT_SEASON)
   await loadWeeks()
}

async function loadWeeks() {
   const { weeks } = await fetchFilters({ season: seasonEl.value })
   populateSelect(weekEl, weeks, DEFAULT_WEEK)
   await loadVenues()
}

async function loadVenues() {
   const { venues } = await fetchFilters({ season: seasonEl.value, week: weekEl.value })
   const allOption = '(all)'
   populateSelect(venueEl, [allOption, ...venues], DEFAULT_VENUE)
   if (!venues.map(String).includes(String(DEFAULT_VENUE))) {
      venueEl.value = allOption
   }
}

seasonEl.addEventListener('change', async () => {
   await loadWeeks()
})

weekEl.addEventListener('change', async () => {
   await loadVenues()
})

function formatScore(scoreStr) {
   return parseInt(scoreStr, 10).toLocaleString()
}

function gameTooltip(machine, round) {
   const playerRows = machine.players.map(p =>
      `<tr><td>${p.name || 'P' + p.player}</td><td>${formatScore(p.score)}</td></tr>`
   ).join('')
   return `<div class="tooltip-title">${machine.name}</div>` +
      `<div class="tooltip-time">Round ${round} &middot; ${machine.reported.local}</div>` +
      `<table class="score-table"><tr><th>Player</th><th>Score</th></tr>${playerRows}</table>`
}

function eventTooltip(label, timestamp) {
   return `<div class="tooltip-title">${label}</div>` +
      `<div class="tooltip-time">${timestamp.local}</div>`
}

function confirmTooltip(side, level, timestamp) {
   const sideLabel = side === 'Left' ? 'Away (Left)' : 'Home (Right)'
   return `<div class="tooltip-title">${level} Confirm &mdash; ${sideLabel}</div>` +
      `<div class="tooltip-time">${timestamp.local}</div>`
}

function renderMatchLinks(matches, season, week) {
   const container = document.getElementById('match-links')

   container.innerHTML = ''
   matches.forEach(match => {
      const a = document.createElement('a')

      a.href = `${MNP_MATCH_URL_BASE}-${season}-${week}-${match.away}-${match.home}`
      a.textContent = `${match.away} @ ${match.home}`
      a.target = '_blank'
      a.rel = 'noopener'
      container.appendChild(a)
   })
}

function clearMatchLinks() {
   document.getElementById('match-links').innerHTML = ''
}

function buildTimeline(matches) {
   const groups = new vis.DataSet()
   const items = new vis.DataSet()
   let itemId = 1

   matches.forEach((match, mi) => {
      const matchGroupId = `match-${mi}`
      const matchLabel = `${match.away}@${match.home}`

      groups.add({
         id: matchGroupId,
         content: matchLabel,
         nestedGroups: match.rounds.map((_, ri) => `${matchGroupId}-r${ri + 1}`)
      })

      // Match-level lineup confirmations
      if (match.confirmLeft) {
         items.add({
            id: itemId++,
            group: matchGroupId,
            start: new Date(match.confirmLeft.epoch),
            end: new Date(match.confirmLeft.epoch + EVENT_MARKER_DURATION_MS),
            type: 'range',
            className: 'event-confirm-lineup',
            title: confirmTooltip('Left', 'Lineup', match.confirmLeft),
            content: ''
         })
      }
      if (match.confirmRight) {
         items.add({
            id: itemId++,
            group: matchGroupId,
            start: new Date(match.confirmRight.epoch),
            end: new Date(match.confirmRight.epoch + EVENT_MARKER_DURATION_MS),
            type: 'range',
            className: 'event-confirm-lineup',
            title: confirmTooltip('Right', 'Lineup', match.confirmRight),
            content: ''
         })
      }

      // Round divider background bands (scoped to this match)
      for (let ri = 0; ri < match.rounds.length - 1; ri++) {
         const endEpoch = getRoundEndEpoch(match.rounds[ri])
         const startEpoch = getRoundStartEpoch(match.rounds[ri + 1])
         if (endEpoch && startEpoch) {
            const nextRound = match.rounds[ri + 1].round
            items.add({
               id: itemId++,
               group: matchGroupId,
               start: new Date(endEpoch),
               end: new Date(startEpoch),
               type: 'background',
               className: 'round-divider',
               content: `${nextRound}`
            })
         }
      }

      match.rounds.forEach((round, ri) => {
         const roundGroupId = `${matchGroupId}-r${ri + 1}`
         groups.add({
            id: roundGroupId,
            content: `Round ${round.round}`
         })

         // Picking
         if (round.picking) {
            const pickEnd = round.responding
               ? round.responding.epoch
               : round.picking.epoch + EVENT_MARKER_DURATION_MS
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(round.picking.epoch),
               end: new Date(pickEnd),
               type: 'range',
               className: 'event-picking',
               title: eventTooltip('Picking', round.picking),
               content: ''
            })
         }

         // Responding
         if (round.responding) {
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(round.responding.epoch),
               end: new Date(round.responding.epoch + EVENT_MARKER_DURATION_MS),
               type: 'range',
               className: 'event-responding',
               title: eventTooltip('Responding', round.responding),
               content: ''
            })
         }

         // Games (machines)
         const GAME_START_OFFSET_MS = 60 * 1000
         round.machines.forEach(machine => {
            if (machine.reported) {
               const gameStart = round.responding
                  ? round.responding.epoch + GAME_START_OFFSET_MS
                  : machine.reported.epoch
               items.add({
                  id: itemId++,
                  group: roundGroupId,
                  start: new Date(gameStart),
                  end: new Date(machine.reported.epoch),
                  type: 'range',
                  className: 'event-game',
                  title: gameTooltip(machine, round.round),
                  content: machine.name
               })
            }
         })

         // Round-level score confirmations
         if (round.confirmLeft) {
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(round.confirmLeft.epoch),
               end: new Date(round.confirmLeft.epoch + EVENT_MARKER_DURATION_MS),
               type: 'range',
               className: 'event-confirm-score',
               title: confirmTooltip('Left', 'Score', round.confirmLeft),
               content: ''
            })
         }
         if (round.confirmRight) {
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(round.confirmRight.epoch),
               end: new Date(round.confirmRight.epoch + EVENT_MARKER_DURATION_MS),
               type: 'range',
               className: 'event-confirm-score',
               title: confirmTooltip('Right', 'Score', round.confirmRight),
               content: ''
            })
         }
      })
   })

   // Compute time range
   const allTimes = items.get().map(i => i.start.getTime())
   const minTime = Math.min(...allTimes) - TIMELINE_PADDING_MS
   const maxTime = Math.max(...allTimes) + TIMELINE_PADDING_MS

   const container = document.getElementById('timeline')
   container.innerHTML = ''

   const options = {
      start: new Date(minTime),
      end: new Date(maxTime),
      min: new Date(minTime - TIMELINE_PADDING_MS * 4),
      max: new Date(maxTime + TIMELINE_PADDING_MS * 4),
      zoomMin: 60 * 1000,
      zoomMax: 12 * 60 * 60 * 1000,
      editable: false,
      selectable: false,
      tooltip: {
         followMouse: true,
         overflowMethod: 'flip',
         template: function(data) {
            return data.title || ''
         }
      },
      orientation: { axis: 'top' },
      groupOrder: 'id',
      margin: { item: { horizontal: 0, vertical: 3 } }
   }

   timeline = new vis.Timeline(container, items, groups, options)
}

function getRoundEndEpoch(round) {
   const candidates = []
   if (round.confirmLeft) candidates.push(round.confirmLeft.epoch)
   if (round.confirmRight) candidates.push(round.confirmRight.epoch)
   round.machines.forEach(m => {
      if (m.reported) candidates.push(m.reported.epoch)
   })
   return candidates.length > 0 ? Math.max(...candidates) : null
}

function getRoundStartEpoch(round) {
   if (round.picking) return round.picking.epoch
   if (round.responding) return round.responding.epoch
   return null
}

async function loadMatches() {
   const season = seasonEl.value
   const week = weekEl.value
   const venue = venueEl.value

   document.getElementById('loading')?.remove()
   document.getElementById('timeline').innerHTML = '<div id="loading">Loading...</div>'

   try {
      let url = `${API_PREFIX}/api/matches?season=${season}&week=${week}`
      if (venue && venue !== '(all)') {
         url += `&venue=${encodeURIComponent(venue)}`
      }
      if (dataVersion) url += `&v=${encodeURIComponent(dataVersion)}`
      const res = await fetch(url)
      if (!res.ok) {
         const err = await res.json()
         throw new Error(err.error || `HTTP ${res.status}`)
      }
      const matches = await res.json()
      if (matches.length === 0) {
         clearMatchLinks()
         document.getElementById('timeline').innerHTML =
            '<div id="loading">No matches found for this filter.</div>'
         return
      }
      renderMatchLinks(matches, season, week)
      buildTimeline(matches)
   } catch (err) {
      clearMatchLinks()
      document.getElementById('timeline').innerHTML =
         `<div id="loading" style="color:#e74c3c">Error: ${err.message}</div>`
   }
}

document.getElementById('loadBtn').addEventListener('click', loadMatches)

// Fetch version, initialize dropdowns, then auto-load
fetchVersion()
   .then(() => loadSeasons())
   .then(() => loadMatches())
