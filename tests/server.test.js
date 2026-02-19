const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { resolvePlayerNames } = require('../site/server')

describe('resolvePlayerNames', () => {
   const playerMap = {
      'abc1234567890': 'Alice',
      'def9876543210': 'Bob'
   }

   it('maps known player IDs to names', () => {
      const matches = [{
         matchup: 'A-B',
         rounds: [{
            round: 1,
            machines: [{
               machine: 1,
               name: 'TZ',
               players: [{ player: 1, id: 'abc1234567890' }]
            }]
         }]
      }]
      const result = resolvePlayerNames(matches, playerMap)
      assert.equal(result[0].rounds[0].machines[0].players[0].name, 'Alice')
   })

   it('falls back to last 7 chars for unknown IDs', () => {
      const matches = [{
         matchup: 'A-B',
         rounds: [{
            round: 1,
            machines: [{
               machine: 1,
               name: 'TZ',
               players: [{ player: 1, id: 'unknown_player_id_xyz' }]
            }]
         }]
      }]
      const result = resolvePlayerNames(matches, playerMap)
      assert.equal(result[0].rounds[0].machines[0].players[0].name, '_id_xyz')
   })

   it('handles null player IDs', () => {
      const matches = [{
         matchup: 'A-B',
         rounds: [{
            round: 1,
            machines: [{
               machine: 1,
               name: 'TZ',
               players: [{ player: 1, id: null }]
            }]
         }]
      }]
      const result = resolvePlayerNames(matches, playerMap)
      assert.equal(result[0].rounds[0].machines[0].players[0].name, null)
   })

   it('handles empty string player IDs', () => {
      const matches = [{
         matchup: 'A-B',
         rounds: [{
            round: 1,
            machines: [{
               machine: 1,
               name: 'TZ',
               players: [{ player: 1, id: '' }]
            }]
         }]
      }]
      const result = resolvePlayerNames(matches, playerMap)
      assert.equal(result[0].rounds[0].machines[0].players[0].name, '')
   })

   it('preserves match/round/machine structure', () => {
      const matches = [{
         matchup: 'X-Y',
         away: 'X',
         home: 'Y',
         venue: 'V1',
         rounds: [{
            round: 1,
            picking: { epoch: 1000, local: 'some time' },
            machines: [{
               machine: 1,
               name: 'Game1',
               players: [{ player: 1, id: 'abc1234567890' }]
            }, {
               machine: 2,
               name: 'Game2',
               players: [{ player: 1, id: 'def9876543210' }]
            }]
         }, {
            round: 2,
            machines: [{
               machine: 1,
               name: 'Game3',
               players: []
            }]
         }]
      }]
      const result = resolvePlayerNames(matches, playerMap)
      assert.equal(result[0].matchup, 'X-Y')
      assert.equal(result[0].away, 'X')
      assert.equal(result[0].home, 'Y')
      assert.equal(result[0].venue, 'V1')
      assert.equal(result[0].rounds.length, 2)
      assert.equal(result[0].rounds[0].picking.epoch, 1000)
      assert.equal(result[0].rounds[0].machines.length, 2)
      assert.equal(result[0].rounds[0].machines[0].players[0].name, 'Alice')
      assert.equal(result[0].rounds[0].machines[1].players[0].name, 'Bob')
      assert.equal(result[0].rounds[1].machines[0].players.length, 0)
   })
})
