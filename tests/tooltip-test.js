// Copyright 2026 John Garnett
const { chromium } = require('playwright')

;(async () => {
   const browser = await chromium.launch({ headless: false })
   const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
   const page = await context.newPage()

   await page.goto('http://localhost:3000/')
   await page.waitForSelector('.vis-item.event-game', { timeout: 10000 })

   // Hover over a game bar to trigger the tooltip
   const gameBar = await page.$('.vis-item.event-game')
   if (gameBar) {
      const box = await gameBar.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(1000)

      const tooltip = await page.$('.vis-tooltip')
      if (tooltip) {
         // Check computed styles on the table elements
         const styles = await page.evaluate(() => {
            const tooltip = document.querySelector('.vis-tooltip')
            const table = tooltip ? tooltip.querySelector('table') : null
            const firstTd = table ? table.querySelector('td') : null
            const secondTd = firstTd ? firstTd.nextElementSibling : null
            if (!firstTd) return 'no td found'
            const cs1 = getComputedStyle(firstTd)
            const cs2 = secondTd ? getComputedStyle(secondTd) : null
            return {
               firstTd_padding: cs1.padding,
               firstTd_paddingRight: cs1.paddingRight,
               secondTd_padding: cs2 ? cs2.padding : 'none',
               table_borderSpacing: table ? getComputedStyle(table).borderSpacing : 'none'
            }
         })
         console.log('Computed styles:', JSON.stringify(styles, null, 2))

         // Take screenshot focused on tooltip
         await tooltip.screenshot({ path: '/Users/garnett/pinball/mnp/replay/tests/tooltip-screenshot.png' })
         console.log('Tooltip screenshot saved')
      } else {
         console.log('No tooltip found')
      }
   } else {
      console.log('No game bar found')
   }

   await page.waitForTimeout(2000)
   await browser.close()
})()
