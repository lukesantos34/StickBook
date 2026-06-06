import { GameSetup, GameState, Play, Half } from './types'

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
  result: string
  runs: number
  outs: number
  basesAfter: { first: string | null; second: string | null; third: string | null }
  note?: string
}): GameState {
  const s: GameState = JSON.parse(JSON.stringify(state))
  const batting = s.half === 'away' ? 'away' : 'home'
  const batterIdx = s.batterIndex[batting]
  const batterName = s.setup[batting + 'Players' as keyof GameSetup] as string[]
  const batter = batterName[batterIdx] || 'Unknown'

  const play: Play = {
    id: String(Date.now()),
    inning: s.inning,
    half: s.half,
    batter,
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
  s.batterIndex[batting] = (s.batterIndex[batting] + 1) % ((s.setup as any)[batting + 'Players'].length || 1)

  // check for end of half
  if (s.outs >= s.setup.outsPerInning) {
    s.outs = 0
    s.bases = { first: null, second: null, third: null }
    if (s.half === 'away') {
      s.half = 'home'
    } else {
      s.half = 'away'
      s.inning += 1
    }
  }

  // check regulation ending
  const finalInnings = s.setup.innings
  if (s.inning > finalInnings) {
    // if home is ahead after away finishes final inning
    if (s.half === 'home' && s.inning > finalInnings && s.score.home > s.score.away) {
      s.completed = true
    }
  }

  // walk-off: if bottom and home takes the lead in final inning or later, end immediately
  if (state.half === 'home' || s.half === 'home') {
    if (s.inning >= finalInnings && s.score.home > s.score.away && state.half === 'home') {
      s.completed = true
    }
  }

  return s
}
