const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
   playerCountForRound,
   ensurePath,
   extractMachines,
   extractAssignments,
   extractScores,
   numericSort,
   buildRounds,
   formatSeattleTime
} = require('../load-posts')

describe('playerCountForRound', () => {
   it('returns 4 for rounds 1 and 4', () => {
      assert.equal(playerCountForRound(1), 4)
      assert.equal(playerCountForRound(4), 4)
   })

   it('returns 2 for rounds 2 and 3', () => {
      assert.equal(playerCountForRound(2), 2)
      assert.equal(playerCountForRound(3), 2)
   })

   it('returns null for unknown rounds', () => {
      assert.equal(playerCountForRound(0), null)
      assert.equal(playerCountForRound(5), null)
      assert.equal(playerCountForRound(99), null)
   })
})

describe('ensurePath', () => {
   it('creates nested objects and returns the leaf', () => {
      const obj = {}
      const leaf = ensurePath(obj, ['a', 'b', 'c'])
      assert.deepEqual(obj, { a: { b: { c: {} } } })
      assert.equal(leaf, obj.a.b.c)
   })

   it('does not overwrite existing properties', () => {
      const obj = { a: { existing: true } }
      const leaf = ensurePath(obj, ['a', 'b'])
      assert.equal(obj.a.existing, true)
      assert.deepEqual(obj.a.b, {})
   })

   it('returns the root object for empty keys', () => {
      const obj = { x: 1 }
      const result = ensurePath(obj, [])
      assert.equal(result, obj)
   })
})

describe('extractMachines', () => {
   it('parses machine and player keys from body', () => {
      const body = {
         'machine.1': 'Twilight Zone',
         'player_1.1': 'abc123',
         'player_2.1': 'def456',
         'machine.2': 'Medieval Madness',
         'player_1.2': 'ghi789'
      }
      const result = extractMachines(body)
      assert.equal(result.length, 2)
      assert.equal(result[0].machine, 1)
      assert.equal(result[0].name, 'Twilight Zone')
      assert.equal(result[0].players.length, 2)
      assert.deepEqual(result[0].players[0], { player: 1, id: 'abc123' })
      assert.deepEqual(result[0].players[1], { player: 2, id: 'def456' })
      assert.equal(result[1].machine, 2)
      assert.equal(result[1].name, 'Medieval Madness')
      assert.equal(result[1].players.length, 1)
   })

   it('returns empty array when no machines present', () => {
      assert.deepEqual(extractMachines({}), [])
   })
})

describe('extractAssignments', () => {
   it('groups players by game and sorts correctly', () => {
      const body = {
         'player_2.1': 'def456',
         'player_1.1': 'abc123',
         'player_1.2': 'ghi789',
         round: '1',
         state: 'responding'
      }
      const result = extractAssignments(body)
      assert.equal(result.length, 2)
      assert.equal(result[0].machine, 1)
      assert.deepEqual(result[0].players, [
         { player: 1, id: 'abc123' },
         { player: 2, id: 'def456' }
      ])
      assert.equal(result[1].machine, 2)
      assert.deepEqual(result[1].players, [
         { player: 1, id: 'ghi789' }
      ])
   })

   it('returns empty array when no player keys present', () => {
      assert.deepEqual(extractAssignments({ round: '1' }), [])
   })
})

describe('extractScores', () => {
   it('parses score_N keys from body', () => {
      const body = { score_1: '1000000', score_2: '500000' }
      const result = extractScores(body)
      assert.deepEqual(result, { 1: '1000000', 2: '500000' })
   })

   it('handles all four score slots', () => {
      const body = { score_1: '100', score_2: '200', score_3: '300', score_4: '400' }
      const result = extractScores(body)
      assert.deepEqual(result, { 1: '100', 2: '200', 3: '300', 4: '400' })
   })

   it('returns empty object when no scores present', () => {
      assert.deepEqual(extractScores({}), {})
   })
})

describe('numericSort', () => {
   it('sorts numbers numerically', () => {
      const arr = ['10', '2', '1', '20']
      assert.deepEqual(arr.sort(numericSort), ['1', '2', '10', '20'])
   })

   it('sorts non-numbers lexically', () => {
      const arr = ['c', 'a', 'b']
      assert.deepEqual(arr.sort(numericSort), ['a', 'b', 'c'])
   })

   it('puts numbers before non-numbers', () => {
      const arr = ['z', '1', 'a', '2']
      assert.deepEqual(arr.sort(numericSort), ['1', '2', 'a', 'z'])
   })
})

describe('buildRounds', () => {
   it('merges picking and responding events into rounds', () => {
      const events = [
         {
            type: 'picking', round: 1, when: 1000,
            whenSeattle: '1/1/2026, 12:00:00 AM',
            machines: [{ machine: 1, name: 'TZ', players: [{ player: 1, id: 'p1' }] }]
         },
         {
            type: 'responding', round: 1, when: 2000,
            whenSeattle: '1/1/2026, 12:00:01 AM',
            assignments: [{ machine: 1, players: [{ player: 2, id: 'p2' }] }]
         }
      ]
      const rounds = buildRounds(events)
      assert.equal(rounds.length, 1)
      assert.equal(rounds[0].round, 1)
      assert.ok(rounds[0].picking)
      assert.ok(rounds[0].responding)
      assert.equal(rounds[0].machines.length, 1)
      assert.equal(rounds[0].machines[0].players.length, 2)
   })

   it('handles multiple picking events for the same round', () => {
      const events = [
         {
            type: 'picking', round: 1, when: 1000,
            whenSeattle: '1/1/2026, 12:00:00 AM',
            machines: [{ machine: 1, name: 'TZ', players: [{ player: 1, id: 'p1' }] }]
         },
         {
            type: 'picking', round: 1, when: 1500,
            whenSeattle: '1/1/2026, 12:00:00 AM',
            machines: [{ machine: 1, name: 'TZ', players: [{ player: 1, id: 'p1' }, { player: 2, id: 'p2' }] }]
         }
      ]
      const rounds = buildRounds(events)
      assert.equal(rounds.length, 1)
      assert.equal(rounds[0].machines[0].players.length, 2)
   })

   it('attaches scores from report events to players', () => {
      const events = [
         {
            type: 'picking', round: 1, when: 1000,
            whenSeattle: '1/1/2026, 12:00:00 AM',
            machines: [{ machine: 1, name: 'TZ', players: [
               { player: 1, id: 'p1' },
               { player: 2, id: 'p2' }
            ] }]
         },
         {
            type: 'report', round: 1, game: 1, when: 3000,
            whenSeattle: '1/1/2026, 12:00:03 AM',
            scores: { 1: '1000000', 2: '500000' }
         }
      ]
      const rounds = buildRounds(events)
      assert.equal(rounds[0].machines[0].players[0].score, '1000000')
      assert.equal(rounds[0].machines[0].players[1].score, '500000')
   })

   it('returns empty array for no events', () => {
      assert.deepEqual(buildRounds([]), [])
   })
})

describe('formatSeattleTime', () => {
   it('formats epoch milliseconds as Seattle time string', () => {
      // 2026-01-01T08:00:00.000Z = midnight in Seattle (PST = UTC-8)
      const epoch = Date.UTC(2026, 0, 1, 8, 0, 0)
      const result = formatSeattleTime(epoch)
      assert.match(result, /1\/1\/2026/)
      assert.match(result, /12:00:00\sAM/)
   })
})
