#!/usr/bin/env node

// Copyright 2026 John Garnett

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { program } = require('commander')
const { loadPosts, printSummary, toArrays } = require('./load-posts')

function getVersion() {
   try {
      return execSync('git describe --tags --always', { encoding: 'utf8' }).trim()
   } catch {
      return 'unknown'
   }
}
const DEFAULT_OUTPUT = 'data/mnp-timeline.json'

program
   .option('--output <filename>', 'output file path', DEFAULT_OUTPUT)
   .option('--mnp-data-archive <directory>', 'path to mnp-data-archive directory', 'mnp-data-archive')
   .option('--posts <directory>', 'path to posts directory', 'data/posts')
   .parse()

const opts = program.opts()
const OUTPUT_FILE = opts.output

console.log('Loading posts...')
const startTime = Date.now()
const result = loadPosts({ archiveDir: opts.mnpDataArchive, postsDir: opts.posts })
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
console.log(`Loaded in ${elapsed}s`)

printSummary(result)

const outputDir = path.dirname(OUTPUT_FILE)
if (!fs.existsSync(outputDir)) {
   fs.mkdirSync(outputDir, { recursive: true })
}

console.log('\nConverting to arrays...')
const output = toArrays(result.data)

output.metadata = {
   version: getVersion(),
   buildDate: new Date().toISOString(),
   nodeJsVersion: process.version,
   options: {
      output: opts.output,
      mnpDataArchive: opts.mnpDataArchive,
      posts: opts.posts
   }
}

console.log(`Writing to ${OUTPUT_FILE}...`)
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2))
const sizeMB = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(1)
console.log(`Done. Output: ${sizeMB} MB`)
