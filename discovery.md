Plan a NodeJS script which will read each file in the @posts/ directory and incorporate it into an in-memory object.

Each record will have a "when" timestamp in it which uses Unix Epoch format (in US/Seattle time zone). Extract this
information and associate it with the record.

The next information to extract is season, week, away team, home team. Do that by processing the "path" value. For example:

If path = "/matches/mnp-19-2-DIH-SCN/picks"

Then season = 19, week = 2, away = DIH, home = SCN

Records should be hierarchically organized by season, then by week, then by matchup between teams (e.g. DTH vs SCN), and by round (1 - 4).

Within a round will be a series of games, with each game featuring either 2 players or 4 players depending on which round it is.
Rounds 1 and 4 are 4 player games and rounds 2 and 3 are 2-player games.

The suffix following the season,week,away,home indicator says what type of record this file is. In the case of "/matches/mnp-19-2-DIH-SCN/picks",
it is a "picks" record.

/picks

Example:

{
  "path": "/matches/mnp-18-8-TBT-PBR/picks",
  "body": {
    "state": "picking",
    "round": "4",
    "machine.1": "CactusCanyon",
    "player_1.1": "2d9d0cc74113cd26dc57032cf2782fed04b50fa3",
    "player_3.1": "6e44f167d8439018981c533f4c61c10d89c84bee",
    "machine.2": "Venom ",
    "player_1.2": "886390cf14b3e1f8782a2a33b2956e3d57ac985f",
    "player_3.2": "accdb9efee52cbf23e675d81d871f18c26dad139",
    "machine.3": "Sopranos",
    "player_1.3": "bee2575e9968dac9662aa4bdf97f44540371487d",
    "player_3.3": "ace784f327f66c086f5246dbb25e7f2eed9a0c68",
    "machine.4": "EBD",
    "player_1.4": "d3b7bbef9f238de4296413bfb999e64b506e328d",
    "player_3.4": "01d5567496c6c4663cb317b4772e1f0b1598e670"
  },
  "when": 1698731886876,
  "user_id": "cTvvNSQFp2G0WfsrK6ismg",
  "ukey": "01d5567496c6c4663cb317b4772e1f0b1598e670"
}

Season 18, week 8, away team TBT vs home team PBR, picking 4 machines with 2 players per machine.

Happen when epoch timestamp was 1698731886876

Players are referenced by ids which will be mapped to actual names eventually.

Given this start, discover the other types of records and summarize what they likely indicate.
