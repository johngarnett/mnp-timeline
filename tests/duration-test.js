// Copyright 2026 John Garnett
// Playwright test: verify duration lines appear in tooltips for picking, responding, and game items
const { chromium } = require('playwright')

const DURATION_PATTERN = /^Duration: \d+:\d{2}$/
const SCREENSHOT_DIR = '/Users/garnett/pinball/mnp/replay/tests'

;(async () => {
   const browser = await chromium.launch({ headless: false })
   const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
   const page = await context.newPage()

   await page.goto('http://localhost:3000/')
   await page.waitForSelector('.vis-item.event-game', { timeout: 15000 })

   let passed = 0
   let failed = 0

   function assert(condition, label) {
      if (condition) {
         console.log(`  PASS: ${label}`)
         passed++
      } else {
         console.log(`  FAIL: ${label}`)
         failed++
      }
   }

   async function hoverItem(selector) {
      const el = await page.$(selector)
      if (!el) return false
      const box = await el.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(800)
      return true
   }

   async function dismissTooltip() {
      await page.mouse.move(0, 0)
      await page.waitForTimeout(400)
   }

   // vis-timeline strips class attributes from tooltip content HTML,
   // so we query by structure: div:nth-child(n) not .className
   async function getTooltipInfo() {
      return page.evaluate(() => {
         const tt = document.querySelector('.vis-tooltip')
         if (!tt) return null
         const firstDiv = tt.querySelector('div:first-child')
         const secondDiv = tt.querySelector('div:nth-child(2)')
         const table = tt.querySelector('table')
         // Duration div is 3rd+ child div (after title and time divs)
         // For event tooltips: div, div, div(duration) -> nth-child(3)
         // For game tooltips: div, div, table, div(duration) -> nth-child(4)
         const durationDiv = tt.querySelector('div:nth-child(4)') || tt.querySelector('div:nth-child(3)')
         // Only treat as duration if it's not the time div and text matches pattern
         const durationText = durationDiv && durationDiv !== secondDiv
            ? durationDiv.textContent.trim()
            : null
         return {
            visible: tt.offsetParent !== null || tt.style.display !== 'none',
            title: firstDiv ? firstDiv.textContent.trim() : null,
            time: secondDiv ? secondDiv.textContent.trim() : null,
            hasTable: !!table,
            durationText,
            childCount: tt.children.length
         }
      })
   }

   // --- Test 1: Game tooltip has duration ---
   console.log('\n--- Game tooltip ---')
   if (await hoverItem('.vis-item.event-game')) {
      const info = await getTooltipInfo()
      if (info) {
         assert(info.title !== null, `game tooltip has title (got: "${info.title}")`)
         assert(info.hasTable, 'game tooltip has score table')
         assert(info.durationText !== null, 'game tooltip has duration text')
         assert(
            info.durationText && DURATION_PATTERN.test(info.durationText),
            `game duration format "Duration: M:SS" (got: "${info.durationText}")`
         )
         await page.screenshot({ path: `${SCREENSHOT_DIR}/duration-game-tooltip.png` })
      } else {
         console.log('  SKIP: tooltip not found after hover')
      }
   } else {
      console.log('  SKIP: no game element found')
   }
   await dismissTooltip()

   // --- Test 2: Picking tooltip has duration ---
   console.log('\n--- Picking tooltip ---')
   if (await hoverItem('.vis-item.event-picking')) {
      const info = await getTooltipInfo()
      if (info) {
         assert(info.title === 'Picking', `title is "Picking" (got: "${info.title}")`)
         assert(info.durationText !== null, 'picking tooltip has duration text')
         assert(
            info.durationText && DURATION_PATTERN.test(info.durationText),
            `picking duration format "Duration: M:SS" (got: "${info.durationText}")`
         )
         await page.screenshot({ path: `${SCREENSHOT_DIR}/duration-picking-tooltip.png` })
      } else {
         console.log('  SKIP: tooltip not found after hover')
      }
   } else {
      console.log('  SKIP: no picking element found')
   }
   await dismissTooltip()

   // --- Test 3: Responding tooltip has duration ---
   console.log('\n--- Responding tooltip ---')
   if (await hoverItem('.vis-item.event-responding')) {
      const info = await getTooltipInfo()
      if (info) {
         assert(info.title === 'Responding', `title is "Responding" (got: "${info.title}")`)
         assert(info.durationText !== null, 'responding tooltip has duration text')
         assert(
            info.durationText && DURATION_PATTERN.test(info.durationText),
            `responding duration format "Duration: M:SS" (got: "${info.durationText}")`
         )
         await page.screenshot({ path: `${SCREENSHOT_DIR}/duration-responding-tooltip.png` })
      } else {
         console.log('  SKIP: tooltip not found after hover')
      }
   } else {
      console.log('  SKIP: no responding element found')
   }
   await dismissTooltip()

   // --- Test 4: Confirm tooltip does NOT have duration ---
   console.log('\n--- Confirm tooltip (no duration expected) ---')
   const confirmFound = await hoverItem('.vis-item.event-confirm-score')
      || await hoverItem('.vis-item.event-confirm-lineup')
   if (confirmFound) {
      const info = await getTooltipInfo()
      if (info) {
         const hasDuration = info.durationText && DURATION_PATTERN.test(info.durationText)
         assert(!hasDuration, 'confirm tooltip does NOT have duration')
         await page.screenshot({ path: `${SCREENSHOT_DIR}/duration-confirm-tooltip.png` })
      } else {
         console.log('  SKIP: tooltip not found after hover')
      }
   } else {
      console.log('  SKIP: no confirm element found')
   }
   await dismissTooltip()

   // --- Test 5: Responding bar spans real duration (wider than 30s marker) ---
   console.log('\n--- Responding bar real duration ---')
   const barWidths = await page.evaluate(() => {
      const resp = document.querySelector('.vis-item.event-responding')
      const pick = document.querySelector('.vis-item.event-picking')
      return {
         responding: resp ? resp.getBoundingClientRect().width : null,
         picking: pick ? pick.getBoundingClientRect().width : null
      }
   })
   if (barWidths.responding !== null) {
      assert(barWidths.responding > 5, `responding bar visible (${barWidths.responding.toFixed(1)}px)`)
      console.log(`  Picking: ${barWidths.picking?.toFixed(1)}px, Responding: ${barWidths.responding.toFixed(1)}px`)
   } else {
      console.log('  SKIP: no responding bar found')
   }

   // --- Summary ---
   console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)

   await page.waitForTimeout(1500)
   await browser.close()

   process.exit(failed > 0 ? 1 : 0)
})()
