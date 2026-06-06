import { GameSetup, GameState, Play } from './types'

const STORAGE_KEY = 'stickbook_current'
const HISTORY_KEY = 'stickbook_history'
const COMPLETED_KEY = 'stickbook_completed'

export function initGame(setup: GameSetup): GameState {
  return {
    setup,
    inning: 1,
    half: 'away',
    outs: 0,
    score: { away: 0, home: 0 },
    bases: { first: null, second: null, third: null },
    batterIndex: { away: 0, home: 0 },
    plays: [],
    completed: false,
  }
}

export function normalizePlayers(raw: string): string[] {
  return raw
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean)
}

export function getBatterName(state: GameState): string {
  const batting = state.half === 'away' ? 'away' : 'home'
  const players = batting === 'away' ? state.setup.awayPlayers : state.setup.homePlayers
  return players[state.batterIndex[batting]] || 'Unknown'
}

export function getBaseOccupancyCount(state: GameState): number {
  return [state.bases.first, state.bases.second, state.bases.third].filter(Boolean).length
}

export function getDefaultPlayState(
  category: string,
  result: string,
  state: GameState,
): { runs: number; outs: number; basesAfter: { first: string | null; second: string | null; third: string | null } } {
  const batter = getBatterName(state)
  const occupied = getBaseOccupancyCount(state)
  const emptyBases = { first: null, second: null, third: null }

  switch (`${category}:${result}`) {
    case 'Out:Groundout':
    case 'Out:Flyout':
    case 'Out:Lineout':
    case 'Out:Popout':
    case 'Out:Strikeout':
    case 'Out:Sacrifice':
      return { runs: 0, outs: 1, basesAfter: { ...state.bases } }
    case 'Hit:Single':
      return { runs: 0, outs: 0, basesAfter: { first: batter, second: state.bases.second, third: state.bases.third } }
    case 'Hit:Double':
      return { runs: 0, outs: 0, basesAfter: { first: null, second: batter, third: state.bases.third } }
    case 'Hit:Triple':
      return { runs: 0, outs: 0, basesAfter: { first: null, second: null, third: batter } }
    case 'Hit:Home Run':
      return { runs: 1 + occupied, outs: 0, basesAfter: emptyBases }
    case 'Walk:Walk':
    case 'Walk:Intentional Walk':
      return { runs: 0, outs: 0, basesAfter: { first: batter, second: state.bases.second, third: state.bases.third } }
    case 'Error:Reached on Error':
    case 'Error:Throwing Error':
    case 'Error:Fielding Error':
    case 'Error:Dropped Ball':
      return { runs: 0, outs: 0, basesAfter: { first: batter, second: state.bases.second, third: state.bases.third } }
    case 'Runner Out / Weird Play:Fielder’s Choice':
      return { runs: 0, outs: 1, basesAfter: { first: batter, second: state.bases.second, third: state.bases.third } }
    case 'Runner Out / Weird Play:Tagged Out Advancing':
      return { runs: 0, outs: 1, basesAfter: { ...state.bases } }
    case 'Runner Out / Weird Play:Double Play':
      return { runs: 0, outs: 2, basesAfter: { ...state.bases } }
    case 'Runner Out / Weird Play:Runner Interference':
      return { runs: 0, outs: 1, basesAfter: { ...state.bases } }
    case 'Runner Out / Weird Play:Other Weird Play':
      return { runs: 0, outs: 0, basesAfter: { ...state.bases } }
    default:
      return { runs: 0, outs: 0, basesAfter: { ...state.bases } }
  }
}

export function saveGame(state: GameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GameState
  } catch (e) {
    return null
  }
}

export function clearGame() {
  localStorage.removeItem(STORAGE_KEY)
}

export function pushHistory(state: GameState) {
  const raw = localStorage.getItem(HISTORY_KEY)
  const arr: GameState[] = raw ? JSON.parse(raw) : []
  arr.push(state)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr))
}

export function popHistory(): GameState | null {
  const raw = localStorage.getItem(HISTORY_KEY)
  if (!raw) return null
  const arr: GameState[] = JSON.parse(raw)
  const last = arr.pop() || null
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr))
  return last
}

export function resetHistory() {
  localStorage.removeItem(HISTORY_KEY)
}

export function addCompleted(state: GameState) {
  const raw = localStorage.getItem(COMPLETED_KEY)
  const arr: GameState[] = raw ? JSON.parse(raw) : []
  arr.push(state)
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(arr))
}

export function getCompleted(): GameState[] {
  const raw = localStorage.getItem(COMPLETED_KEY)
  return raw ? JSON.parse(raw) : []
}

export function applyPlay(state: GameState, playInput: {
  category?: string
  result: string
  runs: number
  outs: number
  basesAfter: { first: string | null; second: string | null; third: string | null }
  note?: string
}): GameState {
  const s: GameState = JSON.parse(JSON.stringify(state))
  const batting = s.half === 'away' ? 'away' : 'home'
  const batter = getBatterName(s)

  const play: Play = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    inning: s.inning,
    half: s.half,
    batter,
    category: playInput.category,
    result: playInput.result,
    runs: playInput.runs,
    outs: playInput.outs,
    note: playInput.note,
    scoreAfter: { ...s.score },
    basesAfter: { ...playInput.basesAfter },
  }

  // update score
  if (s.half === 'away') s.score.away += playInput.runs
  else s.score.home += playInput.runs

  // update outs
  s.outs += playInput.outs

  // update bases to manual selection
  s.bases = { ...playInput.basesAfter }

  // push play with updated score
  play.scoreAfter = { ...s.score }
  s.plays.push(play)

  // advance batter index
  const battingPlayers = batting === 'away' ? s.setup.awayPlayers : s.setup.homePlayers
  s.batterIndex[batting] = (s.batterIndex[batting] + 1) % (battingPlayers.length || 1)

  // walk-off if home takes the lead in the bottom of the final inning or later
  if (s.half === 'home' && s.inning >= s.setup.innings && s.score.home > s.score.away) {
    s.completed = true
    return s
  }

  if (s.outs < s.setup.outsPerInning) {
    return s
  }

  s.outs = 0
  s.bases = { first: null, second: null, third: null }

  if (s.half === 'away') {
    if (s.inning >= s.setup.innings && s.score.home > s.score.away) {
      s.completed = true
      return s
    }
    s.half = 'home'
    return s
  }

  if (s.score.away > s.score.home) {
    s.completed = true
    return s
  }

  if (s.inning >= s.setup.innings && s.score.home === s.score.away) {
    s.inning += 1
    s.half = 'away'
    return s
  }

  s.inning += 1
  s.half = 'away'

  return s
}
