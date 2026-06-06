import React, { useEffect, useMemo, useState } from 'react'
import './App.css'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import {
  addCompleted,
  applyPlay,
  getBatterName,
  getDefaultPlayState,
  getCompleted,
  initGame,
  loadGame,
  normalizePlayers,
  popHistory,
  pushHistory,
  resetHistory,
  saveGame,
} from './gameLogic'
import { GameSetup, GameState, Play, PlayCategory } from './types'

type View = 'landing' | 'setup' | 'live' | 'report' | 'viewShared'
type ConsoleCategory = PlayCategory | null

type SetupErrors = Partial<Record<'title' | 'innings' | 'outsPerInning' | 'awayPlayers' | 'homePlayers', string>>

const STORAGE_KEY = 'stickbook_current'

const PLAY_CATEGORIES: PlayCategory[] = ['Out', 'Hit', 'Walk', 'Error', 'Runner Out / Weird Play', 'Other']

const PLAY_RESULTS: Record<Exclude<PlayCategory, 'Other'>, string[]> = {
  Out: ['Groundout', 'Flyout', 'Lineout', 'Popout', 'Strikeout', 'Sacrifice'],
  Hit: ['Single', 'Double', 'Triple', 'Home Run'],
  Walk: ['Walk', 'Intentional Walk'],
  Error: ['Reached on Error', 'Throwing Error', 'Fielding Error', 'Dropped Ball'],
  'Runner Out / Weird Play': ['Fielder’s Choice', 'Tagged Out Advancing', 'Double Play', 'Runner Interference', 'Other Weird Play'],
}

const BASE_OPTIONS = ['Empty', 'Current batter']

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [game, setGame] = useState<GameState | null>(null)
  const [sharedGame, setSharedGame] = useState<GameState | null>(null)

  useEffect(() => {
    if (location.hash.startsWith('#game=')) {
      const data = location.hash.replace('#game=', '')
      try {
        const json = decompressFromEncodedURIComponent(data) || atob(data)
        const decoded = JSON.parse(json) as GameState
        setSharedGame(decoded)
        setView('viewShared')
        return
      } catch {
        // ignore malformed share links and fall back to local storage
      }
    }

    const existing = loadGame()
    if (existing) {
      setGame(existing)
    }
  }, [])

  useEffect(() => {
    if (game) {
      saveGame(game)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [game])

  function handleCreate(setup: GameSetup) {
    const next = initGame(setup)
    resetHistory()
    setGame(next)
    setView('live')
  }

  function handleSavePlay(input: {
    category?: PlayCategory
    result: string
    runs: number
    outs: number
    basesAfter: { first: string | null; second: string | null; third: string | null }
    note?: string
  }) {
    if (!game) return
    pushHistory(game)
    const next = applyPlay(game, input)
    setGame(next)
    if (next.completed) {
      addCompleted(next)
      setView('report')
    }
  }

  function handleUndo() {
    const previous = popHistory()
    if (previous) setGame(previous)
  }

  function handleEndGame() {
    if (!game) return
    const finished = { ...game, completed: true }
    addCompleted(finished)
    setGame(finished)
    setView('report')
  }

  function handleReset() {
    localStorage.removeItem(STORAGE_KEY)
    resetHistory()
    setGame(null)
    setView('landing')
  }

  const currentGameForLanding = game

  return (
    <div className="container">
      <header className="app-header card">
        <div className="app-title">StickBook</div>
        <div className="app-subtitle">Mobile stickball scorekeeper</div>
      </header>

      {view === 'landing' && (
        <Landing
          currentGame={currentGameForLanding}
          onNew={() => setView('setup')}
          onContinue={() => setView('live')}
          onViewReport={() => setView('report')}
        />
      )}

      {view === 'setup' && <Setup onCreate={handleCreate} onCancel={() => setView('landing')} />}

      {view === 'live' && game && (
        <LiveGame
          game={game}
          onSavePlay={handleSavePlay}
          onUndo={handleUndo}
          onEndGame={handleEndGame}
          onViewReport={() => setView('report')}
          onReset={handleReset}
        />
      )}

      {view === 'report' && (game ? <Report game={game} onBack={() => setView('landing')} /> : sharedGame ? <Report game={sharedGame} onBack={() => setView('landing')} /> : null)}

      {view === 'viewShared' && sharedGame && <Report game={sharedGame} onBack={() => setView('landing')} />}
    </div>
  )
}

function Landing({
  currentGame,
  onNew,
  onContinue,
  onViewReport,
}: {
  currentGame: GameState | null
  onNew: () => void
  onContinue: () => void
  onViewReport: () => void
}) {
  const completedGames = getCompleted()
  const latestCompleted = completedGames[completedGames.length - 1] ?? null

  return (
    <>
      <div className="card action-card">
        <button className="big-btn" onClick={onNew}>
          New Game
        </button>
      </div>

      {currentGame && !currentGame.completed && (
        <div className="card action-card">
          <button className="big-btn secondary-btn strong-btn" onClick={onContinue}>
            Continue Game
          </button>
        </div>
      )}

      {(latestCompleted || currentGame?.completed) && (
        <div className="card action-card">
          <button className="big-btn secondary-btn strong-btn" onClick={onViewReport}>
            View Report
          </button>
        </div>
      )}
    </>
  )
}

function Setup({ onCreate, onCancel }: { onCreate: (setup: GameSetup) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [innings, setInnings] = useState('7')
  const [outsPerInning, setOutsPerInning] = useState('3')
  const [awayTeam, setAwayTeam] = useState('Away')
  const [homeTeam, setHomeTeam] = useState('Home')
  const [awayPlayers, setAwayPlayers] = useState('')
  const [homePlayers, setHomePlayers] = useState('')
  const [errors, setErrors] = useState<SetupErrors>({})

  function validate(): SetupErrors {
    const nextErrors: SetupErrors = {}

    if (!title.trim()) nextErrors.title = 'Match title is required.'

    if (!/^\d+$/.test(innings.trim())) {
      nextErrors.innings = 'Innings must be a whole number from 1 to 20.'
    } else {
      const inningsValue = Number(innings)
      if (inningsValue < 1 || inningsValue > 20) nextErrors.innings = 'Innings must be between 1 and 20.'
    }

    if (!/^\d+$/.test(outsPerInning.trim())) {
      nextErrors.outsPerInning = 'Outs per inning must be a whole number from 1 to 10.'
    } else {
      const outsValue = Number(outsPerInning)
      if (outsValue < 1 || outsValue > 10) nextErrors.outsPerInning = 'Outs per inning must be between 1 and 10.'
    }

    if (normalizePlayers(awayPlayers).length < 1) nextErrors.awayPlayers = 'Add at least one away player.'
    if (normalizePlayers(homePlayers).length < 1) nextErrors.homePlayers = 'Add at least one home player.'

    return nextErrors
  }

  function submit() {
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    onCreate({
      title: title.trim(),
      location: location.trim(),
      innings: Number(innings),
      outsPerInning: Number(outsPerInning),
      awayTeam: awayTeam.trim(),
      homeTeam: homeTeam.trim(),
      awayPlayers: normalizePlayers(awayPlayers),
      homePlayers: normalizePlayers(homePlayers),
    })
  }

  return (
    <div className="card form-card">
      <div className="field"><label>Match Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
      <div className="grid-2">
        <div className="field"><label>Innings</label><input inputMode="numeric" value={innings} onChange={(e) => setInnings(e.target.value)} /></div>
        <div className="field"><label>Outs Per Inning</label><input inputMode="numeric" value={outsPerInning} onChange={(e) => setOutsPerInning(e.target.value)} /></div>
      </div>
      <div className="field"><label>Away Team Name</label><input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} /></div>
      <div className="field"><label>Home Team Name</label><input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} /></div>
      <div className="field"><label>Away Players</label><textarea rows={4} value={awayPlayers} onChange={(e) => setAwayPlayers(e.target.value)} /></div>
      <div className="field"><label>Home Players</label><textarea rows={4} value={homePlayers} onChange={(e) => setHomePlayers(e.target.value)} /></div>

      <div className="setup-errors">
        {errors.title && <div className="error-text">{errors.title}</div>}
        {errors.innings && <div className="error-text">{errors.innings}</div>}
        {errors.outsPerInning && <div className="error-text">{errors.outsPerInning}</div>}
        {errors.awayPlayers && <div className="error-text">{errors.awayPlayers}</div>}
        {errors.homePlayers && <div className="error-text">{errors.homePlayers}</div>}
      </div>

      <div className="grid-2 actions-row">
        <button className="big-btn" onClick={submit}>Create Game</button>
        <button className="secondary-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function LiveGame({
  game,
  onSavePlay,
  onUndo,
  onEndGame,
  onViewReport,
  onReset,
}: {
  game: GameState
  onSavePlay: (input: {
    category?: PlayCategory
    result: string
    runs: number
    outs: number
    basesAfter: { first: string | null; second: string | null; third: string | null }
    note?: string
  }) => void
  onUndo: () => void
  onEndGame: () => void
  onViewReport: () => void
  onReset: () => void
}) {
  const [category, setCategory] = useState<ConsoleCategory>(null)
  const [result, setResult] = useState('')
  const [customResultInput, setCustomResultInput] = useState('')
  const [runs, setRuns] = useState(0)
  const [outs, setOuts] = useState(0)
  const [note, setNote] = useState('')
  const [basesAfter, setBasesAfter] = useState<{ first: string | null; second: string | null; third: string | null }>({ first: null, second: null, third: null })

  const battingTeamKey = game.half === 'away' ? 'away' : 'home'
  const battingTeamName = game.setup[`${battingTeamKey}Team` as const]
  const battingPlayers = game.setup[`${battingTeamKey}Players` as const]
  const batter = getBatterName(game)

  const currentResultOptions = category && category !== 'Other' ? PLAY_RESULTS[category as Exclude<PlayCategory, 'Other'>] : []

  const baseOptions = useMemo(() => {
    return battingPlayers
      .filter((player) => player !== basesAfter.first && player !== basesAfter.second && player !== basesAfter.third)
      .map((player) => player)
  }, [battingPlayers, basesAfter.first, basesAfter.second, basesAfter.third])

  function resetConsole() {
    setCategory(null)
    setResult('')
    setCustomResultInput('')
    setRuns(0)
    setOuts(0)
    setNote('')
    setBasesAfter({ first: null, second: null, third: null })
  }

  function chooseCategory(nextCategory: PlayCategory) {
    setCategory(nextCategory)
    if (nextCategory === 'Other') {
      setResult('')
      setCustomResultInput('')
      const defaults = { runs: 0, outs: 0, basesAfter: { ...game.bases } }
      setRuns(defaults.runs)
      setOuts(defaults.outs)
      setBasesAfter(defaults.basesAfter)
      return
    }

    const firstResult = PLAY_RESULTS[nextCategory as Exclude<PlayCategory, 'Other'>][0]
    const defaults = getDefaultPlayState(nextCategory, firstResult, game)
    setResult(firstResult)
    setRuns(defaults.runs)
    setOuts(defaults.outs)
    setBasesAfter(defaults.basesAfter)
    setNote('')
  }

  function chooseResult(nextResult: string) {
    if (!category) return
    setResult(nextResult)
    const defaults = getDefaultPlayState(category, nextResult, game)
    setRuns(defaults.runs)
    setOuts(defaults.outs)
    setBasesAfter(defaults.basesAfter)
  }

  function save() {
    if (!category || !result.trim()) return
    onSavePlay({
      category,
      result: result.trim(),
      runs: Number.isFinite(runs) ? runs : 0,
      outs: Number.isFinite(outs) ? outs : 0,
      basesAfter,
      note: note.trim() || undefined,
    })
    resetConsole()
  }

  function setBase(base: 'first' | 'second' | 'third', value: string) {
    let nextValue: string | null = value === 'Empty' ? null : value === 'Current batter' ? batter : value
    setBasesAfter((current) => ({ ...current, [base]: nextValue }))
  }

  function quickBases(action: 'clear' | '1st' | '2nd' | '3rd') {
    if (action === 'clear') setBasesAfter({ first: null, second: null, third: null })
    if (action === '1st') setBasesAfter({ first: batter, second: null, third: null })
    if (action === '2nd') setBasesAfter({ first: null, second: batter, third: null })
    if (action === '3rd') setBasesAfter({ first: null, second: null, third: batter })
  }

  return (
    <>
      <div className="card scoreboard-card">
        <DiamondDisplay bases={game.bases} />
        <div className="scoreboard">
          <div className="score-box">
            <div className="small">{game.setup.awayTeam}</div>
            <div className="score-value">{game.score.away}</div>
          </div>
          <div className="score-box status-box">
            <div className="inning-label">{game.half === 'away' ? 'Top' : 'Bottom'} {game.inning}</div>
            <div className="small">Outs: {game.outs}/{game.setup.outsPerInning}</div>
            <div className="small">Batting: {battingTeamName}</div>
            <div className="small">Current batter: {batter}</div>
          </div>
          <div className="score-box">
            <div className="small">{game.setup.homeTeam}</div>
            <div className="score-value">{game.score.home}</div>
          </div>
        </div>
      </div>

      <div className="card">
        {!category ? (
          <>
            <div className="section-title">Choose play category</div>
            <div className="button-grid">
              {PLAY_CATEGORIES.map((item) => (
                <button key={item} className="console-btn" onClick={() => chooseCategory(item)}>
                  {item}
                </button>
              ))}
            </div>
          </>
        ) : !result || (category === 'Other' && !result.trim()) ? (
          <>
            <div className="top-line">
              <div className="section-title">{category}</div>
              <button className="secondary-btn" onClick={() => setCategory(null)}>Back</button>
            </div>

            {category === 'Other' ? (
              <div className="other-result-panel">
                <div className="field"><label>Custom result</label><input value={customResultInput} onChange={(e) => setCustomResultInput(e.target.value)} placeholder="Short result description" /></div>
                <button className="big-btn" onClick={() => customResultInput.trim() && chooseResult(customResultInput.trim())}>Use Result</button>
              </div>
            ) : (
              <div className="button-grid">
                {currentResultOptions.map((item) => (
                  <button key={item} className="console-btn" onClick={() => chooseResult(item)}>
                    {item}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <ConfirmPlayPanel
            game={game}
            category={category}
            result={result}
            runs={runs}
            outs={outs}
            note={note}
            basesAfter={basesAfter}
            battingPlayers={battingPlayers}
            currentBatter={batter}
            baseOptions={baseOptions}
            onBack={() => {
              if (category === 'Other') {
                setResult('')
                return setCategory('Other')
              }
              const resultList = PLAY_RESULTS[category as Exclude<PlayCategory, 'Other'>]
              if (resultList.length > 1) {
                return setResult('')
              }
              setCategory(null)
            }}
            onCancel={resetConsole}
            onQuickBases={quickBases}
            onBaseChange={setBase}
            onRunsDelta={(delta) => setRuns((value) => Math.max(0, value + delta))}
            onOutsDelta={(delta) => setOuts((value) => Math.max(0, value + delta))}
            onNoteChange={setNote}
            onSave={save}
          />
        )}
      </div>

      <div className="card control-card">
        <div className="grid-2 actions-row">
          <button className="secondary-btn" onClick={onUndo}>Undo Last Play</button>
          <button className="secondary-btn" onClick={onViewReport}>View Report</button>
          <button className="secondary-btn" onClick={onEndGame}>End Game</button>
          <button className="secondary-btn" onClick={onReset}>Reset Game</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Play-by-play</div>
        <div className="plays">
          {game.plays.slice().reverse().map((play: Play) => (
            <div key={play.id} className="play-item">
              <div className="play-title">
                {play.inning}{play.half === 'away' ? 'T' : 'B'} • {play.batter} • {play.result}
              </div>
              <div className="small">
                {play.category ? `${play.category} • ` : ''}Runs: {play.runs} Outs: {play.outs} Score: {play.scoreAfter.away}-{play.scoreAfter.home}
              </div>
              <div className="small">Bases: {formatBases(play.basesAfter)}</div>
              {play.note && <div className="small">Note: {play.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ConfirmPlayPanel({
  game,
  category,
  result,
  runs,
  outs,
  note,
  basesAfter,
  battingPlayers,
  currentBatter,
  baseOptions,
  onBack,
  onCancel,
  onQuickBases,
  onBaseChange,
  onRunsDelta,
  onOutsDelta,
  onNoteChange,
  onSave,
}: {
  game: GameState
  category: PlayCategory
  result: string
  runs: number
  outs: number
  note: string
  basesAfter: { first: string | null; second: string | null; third: string | null }
  battingPlayers: string[]
  currentBatter: string
  baseOptions: string[]
  onBack: () => void
  onCancel: () => void
  onQuickBases: (action: 'clear' | '1st' | '2nd' | '3rd') => void
  onBaseChange: (base: 'first' | 'second' | 'third', value: string) => void
  onRunsDelta: (delta: number) => void
  onOutsDelta: (delta: number) => void
  onNoteChange: (value: string) => void
  onSave: () => void
}) {
  const baseChoices = [
    ...BASE_OPTIONS,
    currentBatter,
    ...battingPlayers.filter((player) => player !== currentBatter && player !== basesAfter.first && player !== basesAfter.second && player !== basesAfter.third),
  ]

  const filteredBaseChoices = (base: 'first' | 'second' | 'third') => {
    const taken = [
      base !== 'first' ? basesAfter.first : null,
      base !== 'second' ? basesAfter.second : null,
      base !== 'third' ? basesAfter.third : null,
    ].filter(Boolean)

    return baseChoices.filter((choice) => choice === 'Empty' || choice === 'Current batter' || !taken.includes(choice))
  }

  return (
    <div className="confirm-panel">
      <div className="top-line">
        <div>
          <div className="section-title">Confirm Play</div>
          <div className="small">{game.setup.awayTeam} vs {game.setup.homeTeam}</div>
        </div>
        <button className="secondary-btn" onClick={onBack}>Back</button>
      </div>

      <div className="confirm-summary">
        <div><span className="summary-label">Batter</span><div className="summary-value">{currentBatter}</div></div>
        <div><span className="summary-label">Result</span><div className="summary-value">{result}</div></div>
        <div><span className="summary-label">Category</span><div className="summary-value">{category}</div></div>
      </div>

      <div className="counter-row">
        <div className="counter-card">
          <div className="counter-label">Runs</div>
          <div className="counter-controls">
            <button className="counter-btn" onClick={() => onRunsDelta(-1)}>-</button>
            <div className="counter-value">{runs}</div>
            <button className="counter-btn" onClick={() => onRunsDelta(1)}>+</button>
          </div>
        </div>
        <div className="counter-card">
          <div className="counter-label">Outs</div>
          <div className="counter-controls">
            <button className="counter-btn" onClick={() => onOutsDelta(-1)}>-</button>
            <div className="counter-value">{outs}</div>
            <button className="counter-btn" onClick={() => onOutsDelta(1)}>+</button>
          </div>
        </div>
      </div>

      <div className="quick-bases">
        <button className="secondary-btn" onClick={() => onQuickBases('clear')}>Clear Bases</button>
        <button className="secondary-btn" onClick={() => onQuickBases('1st')}>Batter to 1st</button>
        <button className="secondary-btn" onClick={() => onQuickBases('2nd')}>Batter to 2nd</button>
        <button className="secondary-btn" onClick={() => onQuickBases('3rd')}>Batter to 3rd</button>
      </div>

      <div className="base-editor">
        <div className="field">
          <label>1st Base</label>
          <select value={basesAfter.first ?? 'Empty'} onChange={(e) => onBaseChange('first', e.target.value)}>
            {filteredBaseChoices('first').map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>2nd Base</label>
          <select value={basesAfter.second ?? 'Empty'} onChange={(e) => onBaseChange('second', e.target.value)}>
            {filteredBaseChoices('second').map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>3rd Base</label>
          <select value={basesAfter.third ?? 'Empty'} onChange={(e) => onBaseChange('third', e.target.value)}>
            {filteredBaseChoices('third').map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Note</label>
        <textarea rows={2} value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder="Optional note" />
      </div>

      <div className="grid-2 actions-row confirm-actions">
        <button className="big-btn" onClick={onSave}>Save Play</button>
        <button className="secondary-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function DiamondDisplay({ bases }: { bases: GameState['bases'] }) {
  return (
    <div className="diamond-wrap" aria-label="Base runner display">
      <div className="diamond-row diamond-top">
        <BaseNode label="2B" runner={bases.second} />
      </div>
      <div className="diamond-row diamond-middle">
        <BaseNode label="3B" runner={bases.third} />
        <BaseNode label="1B" runner={bases.first} />
      </div>
    </div>
  )
}

function BaseNode({ label, runner }: { label: string; runner: string | null }) {
  const occupied = Boolean(runner)
  return (
    <div className={`base-node ${occupied ? 'occupied' : ''}`}>
      <div className="base-label">{label}</div>
      <div className="base-runner">{occupied ? runner?.split(' ').map((word) => word[0]).join('').slice(0, 3) : ''}</div>
    </div>
  )
}

function Report({ game, onBack }: { game: GameState; onBack: () => void }) {
  const stats = useMemo(() => {
    const summary: Record<string, { pa: number; hits: number; walks: number; errors: number; outs: number; runs: number; results: string[] }> = {}

    for (const play of game.plays) {
      if (!summary[play.batter]) {
        summary[play.batter] = { pa: 0, hits: 0, walks: 0, errors: 0, outs: 0, runs: 0, results: [] }
      }

      const entry = summary[play.batter]
      entry.pa += 1
      if (['Single', 'Double', 'Triple', 'Home Run'].includes(play.result)) entry.hits += 1
      if (play.result === 'Walk' || play.result === 'Intentional Walk') entry.walks += 1
      if (play.category === 'Error' || play.result.includes('Error')) entry.errors += 1
      entry.outs += play.outs
      entry.runs += play.runs
      entry.results.push(play.category ? `${play.category}: ${play.result}` : play.result)
    }

    return summary
  }, [game.plays])

  function copyShare() {
    try {
      const json = JSON.stringify(game)
      const compressed = compressToEncodedURIComponent(json)
      const url = `${location.origin}${location.pathname}#game=${compressed}`
      navigator.clipboard.writeText(url)
      alert('Share link copied')
    } catch {
      alert('Failed to copy share link')
    }
  }

  const winner = game.score.home > game.score.away ? game.setup.homeTeam : game.score.away > game.score.home ? game.setup.awayTeam : 'Tie'

  return (
    <div>
      <div className="card report-header">
        <div>
          <div className="report-title">{game.setup.title}</div>
          <div className="small">{game.setup.location}</div>
        </div>
        <div className="report-scorebox">
          <div className="score-value">{game.score.away} - {game.score.home}</div>
          <div className="small">Winner: {winner}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Player Summary</div>
        {Object.keys(stats).map((name) => (
          <div key={name} className="play-item">
            <div className="play-title">{name}</div>
            <div className="small">
              PA: {stats[name].pa} • Hits: {stats[name].hits} • Walks: {stats[name].walks} • ROE: {stats[name].errors} • Outs: {stats[name].outs} • Runs: {stats[name].runs}
            </div>
            <div className="small">{stats[name].results.join(', ')}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="grid-2 actions-row">
          <button className="big-btn" onClick={copyShare}>Copy Share Link</button>
          <button className="secondary-btn" onClick={onBack}>Back</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Full Play-by-play</div>
        <div className="plays">
          {game.plays.map((play) => (
            <div key={play.id} className="play-item">
              <div className="play-title">
                {play.inning}{play.half === 'away' ? 'T' : 'B'} • {play.batter} • {play.result}
              </div>
              <div className="small">
                {play.category ? `${play.category} • ` : ''}R:{play.runs} O:{play.outs} Score: {play.scoreAfter.away}-{play.scoreAfter.home}
              </div>
              <div className="small">Bases: {formatBases(play.basesAfter)}</div>
              {play.note && <div className="small">{play.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatBases(bases: { first: string | null; second: string | null; third: string | null }) {
  return [`1B: ${bases.first || '-'}`, `2B: ${bases.second || '-'}`, `3B: ${bases.third || '-'}`].join(' • ')
}
