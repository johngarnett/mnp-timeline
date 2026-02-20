// Copyright 2026 John Garnett

const MNP_MATCH_URL_BASE = 'https://mondaynightpinball.com/matches/mnp'
const TIMELINE_PADDING_MS = 5 * 60 * 1000
const EVENT_MARKER_DURATION_MS = 30 * 1000
const PHASE_TRANSITION_OFFSET_MS = 60 * 1000
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

function formatDuration(durationMs) {
   const totalSeconds = Math.round(durationMs / 1000)
   const minutes = Math.floor(totalSeconds / 60)
   const seconds = totalSeconds % 60
   return `Duration: ${minutes}:${String(seconds).padStart(2, '0')}`
}

function submittedByLine(uidName) {
   if (!uidName) return ''
   return `<div class="tooltip-submitted">Submitted by: ${uidName}</div>`
}

function gameTooltip(machine, round, durationMs) {
   const playerRows = machine.players.map(p =>
      `<tr><td>${p.name || 'P' + p.player}</td><td>${formatScore(p.score)}</td></tr>`
   ).join('')
   const durationLine = durationMs != null
      ? `<div class="tooltip-duration">${formatDuration(durationMs)}</div>`
      : ''
   return `<div class="tooltip-title">${machine.name}</div>` +
      `<div class="tooltip-time">Round ${round} &middot; ${machine.reported.local}</div>` +
      `<table class="score-table"><tr><th>Player</th><th>Score</th></tr>${playerRows}</table>` +
      durationLine +
      submittedByLine(machine.uidName)
}

function eventTooltip(label, timestamp, durationMs) {
   const durationLine = durationMs != null
      ? `<div class="tooltip-duration">${formatDuration(durationMs)}</div>`
      : ''
   return `<div class="tooltip-title">${label}</div>` +
      `<div class="tooltip-time">${timestamp.local}</div>` +
      durationLine +
      submittedByLine(timestamp.uidName)
}

function roundBreakTooltip(nextRound, durationMs) {
   return `<div class="tooltip-title">Round ${nextRound} is Next</div>` +
      `<div class="tooltip-duration">${formatDuration(durationMs)}</div>`
}

function confirmTooltip(side, level, timestamp, durationMs) {
   const sideLabel = side === 'Left' ? 'Away (Left)' : 'Home (Right)'
   const durationLine = durationMs != null
      ? `<div class="tooltip-duration">${formatDuration(durationMs)}</div>`
      : ''
   return `<div class="tooltip-title">${level} Confirm &mdash; ${sideLabel}</div>` +
      `<div class="tooltip-time">${timestamp.local}</div>` +
      durationLine +
      submittedByLine(timestamp.uidName)
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

      // Round break range items (scoped to this match)
      for (let ri = 0; ri < match.rounds.length - 1; ri++) {
         const latestReport = getLatestReportEpoch(match.rounds[ri])
         const rawStart = latestReport
            ? latestReport + PHASE_TRANSITION_OFFSET_MS
            : getRoundEndEpoch(match.rounds[ri])
         const nextRound = match.rounds[ri + 1]
         const gapEnd = nextRound.responding
            ? nextRound.responding.epoch
            : getRoundStartEpoch(nextRound)
         if (rawStart && gapEnd) {
            const gapStart = rawStart <= gapEnd
               ? rawStart
               : (latestReport + gapEnd) / 2
            const gapDuration = gapEnd - gapStart
            items.add({
               id: itemId++,
               group: matchGroupId,
               start: new Date(gapStart),
               end: new Date(gapEnd),
               type: 'range',
               className: 'round-divider',
               title: roundBreakTooltip(nextRound.round, gapDuration),
               content: `${nextRound.round}`
            })
         }
      }

      // Latest lineup confirmation epoch for round 1 picking bar start
      const lineupConfirmEpochs = []
      if (match.confirmLeft) lineupConfirmEpochs.push(match.confirmLeft.epoch)
      if (match.confirmRight) lineupConfirmEpochs.push(match.confirmRight.epoch)
      const latestLineupConfirm = lineupConfirmEpochs.length > 0 ? Math.max(...lineupConfirmEpochs) : null

      match.rounds.forEach((round, ri) => {
         const roundGroupId = `${matchGroupId}-r${ri + 1}`
         groups.add({
            id: roundGroupId,
            content: `Round ${round.round}`
         })

         // Picking: R1 starts after lineup confirmation + 60s,
         //          R2+ starts after previous round's latest score confirmation + 60s
         if (round.picking) {
            let anchorEpoch = null
            if (ri === 0) {
               anchorEpoch = latestLineupConfirm
            } else {
               const prevRound = match.rounds[ri - 1]
               const prevConfirmEpochs = []
               if (prevRound.confirmLeft) prevConfirmEpochs.push(prevRound.confirmLeft.epoch)
               if (prevRound.confirmRight) prevConfirmEpochs.push(prevRound.confirmRight.epoch)
               if (prevConfirmEpochs.length > 0) anchorEpoch = Math.max(...prevConfirmEpochs)
            }
            const pickStart = anchorEpoch !== null
               ? anchorEpoch + PHASE_TRANSITION_OFFSET_MS
               : round.picking.epoch
            const pickEnd = round.picking.epoch
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(pickStart < pickEnd ? pickStart : pickEnd),
               end: new Date(pickStart < pickEnd ? pickEnd : pickEnd + EVENT_MARKER_DURATION_MS),
               type: 'range',
               className: 'event-picking',
               title: eventTooltip('Picking', round.picking, round.picking.duration),
               content: ''
            })
         }

         // Responding: starts at picking + 60s, ends at responding event
         if (round.responding) {
            const respStart = round.picking
               ? round.picking.epoch + PHASE_TRANSITION_OFFSET_MS
               : round.responding.epoch
            const respEnd = round.picking
               ? round.responding.epoch
               : round.responding.epoch + EVENT_MARKER_DURATION_MS
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(respStart),
               end: new Date(respEnd),
               type: 'range',
               className: 'event-responding',
               title: eventTooltip('Responding', round.responding, round.responding.duration),
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
                  title: gameTooltip(machine, round.round, machine.duration),
                  content: machine.name
               })
            }
         })

         // Round-level score confirmations
         const latestReport = getLatestReportEpoch(round)
         const rawConfirmAnchor = latestReport
            ? latestReport + PHASE_TRANSITION_OFFSET_MS
            : null
         if (round.confirmLeft) {
            const confirmEnd = round.confirmLeft.epoch
            const confirmStart = rawConfirmAnchor
               ? (rawConfirmAnchor <= confirmEnd
                  ? rawConfirmAnchor
                  : (latestReport + confirmEnd) / 2)
               : confirmEnd
            const confirmDuration = confirmStart < confirmEnd
               ? confirmEnd - confirmStart
               : null
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(confirmStart),
               end: new Date(confirmEnd),
               type: 'range',
               className: 'event-confirm-score',
               title: confirmTooltip('Left', 'Score', round.confirmLeft, confirmDuration),
               content: ''
            })
         }
         if (round.confirmRight) {
            const confirmEnd = round.confirmRight.epoch
            const confirmStart = rawConfirmAnchor
               ? (rawConfirmAnchor <= confirmEnd
                  ? rawConfirmAnchor
                  : (latestReport + confirmEnd) / 2)
               : confirmEnd
            const confirmDuration = confirmStart < confirmEnd
               ? confirmEnd - confirmStart
               : null
            items.add({
               id: itemId++,
               group: roundGroupId,
               start: new Date(confirmStart),
               end: new Date(confirmEnd),
               type: 'range',
               className: 'event-confirm-score',
               title: confirmTooltip('Right', 'Score', round.confirmRight, confirmDuration),
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

function getLatestReportEpoch(round) {
   const reportEpochs = round.machines
      .filter(m => m.reported)
      .map(m => m.reported.epoch)
   return reportEpochs.length > 0 ? Math.max(...reportEpochs) : null
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
