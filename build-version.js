#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { program } = require('commander')

function getVersion() {
   try {
      return execSync('git describe --tags --always', { encoding: 'utf8' }).trim()
   } catch {
      return 'unknown'
   }
}

program
   .option('--output <filename>', 'output file path', 'data/version.json')
   .parse()

const OUTPUT_FILE = program.opts().output

const outputDir = path.dirname(OUTPUT_FILE)
if (!fs.existsSync(outputDir)) {
   fs.mkdirSync(outputDir, { recursive: true })
}

const versionData = {
   version: getVersion(),
   buildDate: new Date().toISOString()
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(versionData, null, 2))
console.log(`Wrote ${OUTPUT_FILE} (${versionData.version})`)
