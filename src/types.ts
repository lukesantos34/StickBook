export type Half = 'away' | 'home'

export interface Play {
  id: string
  inning: number
  half: Half
  batter: string
  result: string
  runs: number
  outs: number
  note?: string
  scoreAfter: { away: number; home: number }
  basesAfter: { first: string | null; second: string | null; third: string | null }
}

export interface GameSetup {
  title: string
  location?: string
  innings: number
  outsPerInning: number
  awayTeam: string
  homeTeam: string
  awayPlayers: string[]
  homePlayers: string[]
}

export interface GameState {
  setup: GameSetup
  inning: number
  half: Half
  outs: number
  score: { away: number; home: number }
  bases: { first: string | null; second: string | null; third: string | null }
  batterIndex: { away: number; home: number }
  plays: Play[]
  completed: boolean
}
