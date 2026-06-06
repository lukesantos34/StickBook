import React, { useEffect, useState } from 'react'
import './App.css'
import { GameSetup, GameState, Play } from './types'
import { initGame, saveGame, loadGame, pushHistory, popHistory, resetHistory, applyPlay, addCompleted, getCompleted } from './gameLogic'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

type View = 'landing' | 'setup' | 'live' | 'report' | 'viewShared'

const STORAGE_KEY = 'stickbook_current'

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [game, setGame] = useState<GameState | null>(null)
  const [sharedGame, setSharedGame] = useState<GameState | null>(null)

  useEffect(() => {
    // check URL hash for shared game
    if (location.hash.startsWith('#game=')) {
      const data = location.hash.replace('#game=', '')
      try {
        const json = decompressFromEncodedURIComponent(data) || atob(data)
        const g = JSON.parse(json)
        setSharedGame(g)
        setView('viewShared')
        return
      } catch (e) {
        // ignore
      }
    }

    const existing = loadGame()
    if (existing) {
      setGame(existing)
    }
  }, [])

  useEffect(() => {
    if (game) saveGame(game)
    else localStorage.removeItem(STORAGE_KEY)
  }, [game])

  function handleCreate(setup: GameSetup) {
    const g = initGame(setup)
    resetHistory()
    setGame(g)
    setView('live')
  }

  function handleSavePlay(input: { result: string; runs: number; outs: number; basesAfter: any; note?: string }) {
    if (!game) return
    pushHistory(game)
    const next = applyPlay(game, input)
    setGame(next)
  }

  function handleUndo() {
    const prev = popHistory()
    if (prev) setGame(prev)
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

  return (
    <div className="container">
      <div className="card">
        <div className="title">StickBook</div>
      </div>

      {view === 'landing' && (
        <Landing
          onNew={() => setView('setup')}
          onContinue={() => setView('live')}
          hasCurrent={!!game}
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
          onUpdate={(g) => setGame(g)}
        />
      )}

      {view === 'report' && (game ? <Report game={game} onBack={() => setView('landing')} /> : <Report game={sharedGame!} onBack={() => setView('landing')} />)}

      {view === 'viewShared' && sharedGame && <Report game={sharedGame} onBack={() => setView('landing')} />}
    </div>
  )
}

function Landing({ onNew, onContinue, hasCurrent, onViewReport }: { onNew: () => void; onContinue: () => void; hasCurrent: boolean; onViewReport: () => void }) {
  const completed = getCompleted()
  return (
    <>
      <div className="card">
        <button className="big-btn" onClick={onNew}>New Game</button>
      </div>
      {hasCurrent && (
        <div className="card">
          <button className="big-btn" onClick={onContinue}>Continue Game</button>
        </div>
      )}
      {completed.length > 0 && (
        <div className="card">
          <button className="secondary-btn" onClick={onViewReport}>View Recent Report</button>
        </div>
      )}
    </>
  )
}

function Setup({ onCreate, onCancel }: { onCreate: (s: GameSetup) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [innings, setInnings] = useState(7)
  const [outsPerInning, setOutsPerInning] = useState(3)
  const [away, setAway] = useState('Away')
  const [home, setHome] = useState('Home')
  const [awayPlayers, setAwayPlayers] = useState('')
  const [homePlayers, setHomePlayers] = useState('')

  function submit() {
    onCreate({
      title,
      location,
      innings,
      outsPerInning,
      awayTeam: away,
      homeTeam: home,
      awayPlayers: awayPlayers.split('\n').map(s => s.trim()).filter(Boolean),
      homePlayers: homePlayers.split('\n').map(s => s.trim()).filter(Boolean),
    })
  }

  return (
    <div className="card">
      <div className="field"><label>Match Title</label><input value={title} onChange={e=>setTitle(e.target.value)} /></div>
      <div className="field"><label>Location</label><input value={location} onChange={e=>setLocation(e.target.value)} /></div>
      <div className="field"><label>Innings</label><input type="number" value={innings} onChange={e=>setInnings(Number(e.target.value))} /></div>
      <div className="field"><label>Outs Per Inning</label><input type="number" value={outsPerInning} onChange={e=>setOutsPerInning(Number(e.target.value))} /></div>
      <div className="field"><label>Away Team Name</label><input value={away} onChange={e=>setAway(e.target.value)} /></div>
      <div className="field"><label>Home Team Name</label><input value={home} onChange={e=>setHome(e.target.value)} /></div>
      <div className="field"><label>Away Players (one per line)</label><textarea rows={4} value={awayPlayers} onChange={e=>setAwayPlayers(e.target.value)} /></div>
      <div className="field"><label>Home Players (one per line)</label><textarea rows={4} value={homePlayers} onChange={e=>setHomePlayers(e.target.value)} /></div>
      <div style={{display:'flex',gap:8}}>
        <button className="big-btn" onClick={submit}>Create Game</button>
        <button className="secondary-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function LiveGame({ game, onSavePlay, onUndo, onEndGame, onViewReport, onReset, onUpdate }: any) {
  const [result, setResult] = useState('Out')
  const [runs, setRuns] = useState(0)
  const [outs, setOuts] = useState(1)
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  const [third, setThird] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const batting = game.half === 'away' ? 'away' : 'home'
  const batterList = game.setup[batting + 'Players'] as string[]
  const batter = batterList[game.batterIndex[batting]] || 'Unknown'

  function save() {
    onSavePlay({ result, runs: Number(runs), outs: Number(outs), basesAfter: { first, second, third }, note })
    setRuns(0); setOuts(1); setFirst(null); setSecond(null); setThird(null); setNote('')
  }

  return (
    <>
      <div className="card">
        <div className="scoreboard">
          <div className="score-box">
            <div className="small">{game.setup.awayTeam}</div>
            <div style={{fontSize:20,fontWeight:700}}>{game.score.away}</div>
          </div>
          <div className="score-box">
            <div className="small">{game.setup.homeTeam}</div>
            <div style={{fontSize:20,fontWeight:700}}>{game.score.home}</div>
          </div>
        </div>
        <div className="muted">{(game.half === 'away' ? 'Top ' : 'Bottom ') + game.inning} • Outs: {game.outs}</div>
        <div className="muted">Batting: {game.half === 'away' ? game.setup.awayTeam : game.setup.homeTeam}</div>
        <div className="muted">Current batter: {batter}</div>
      </div>

      <div className="card">
        <label>Result</label>
        <select value={result} onChange={e=>setResult(e.target.value)}>
          {['Out','Single','Double','Triple','Home Run','Walk','Error','Fielder\'s Choice','Tagged Out','Sacrifice','Other'].map(r=> <option key={r} value={r}>{r}</option>)}
        </select>

        <div className="field"><label>Runs on play</label><input type="number" value={runs} onChange={e=>setRuns(Number(e.target.value))} /></div>
        <div className="field"><label>Outs on play</label><input type="number" value={outs} onChange={e=>setOuts(Number(e.target.value))} /></div>

        <div className="field"><label>First base after play (player name or empty)</label><input value={first ?? ''} onChange={e=>setFirst(e.target.value || null)} /></div>
        <div className="field"><label>Second base after play</label><input value={second ?? ''} onChange={e=>setSecond(e.target.value || null)} /></div>
        <div className="field"><label>Third base after play</label><input value={third ?? ''} onChange={e=>setThird(e.target.value || null)} /></div>

        <div className="field"><label>Note</label><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} /></div>

        <div style={{display:'flex',gap:8}}>
          <button className="big-btn" onClick={save}>Save Play</button>
        </div>

        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button className="secondary-btn" onClick={onUndo}>Undo Last Play</button>
          <button className="secondary-btn" onClick={onViewReport}>View Report</button>
          <button className="secondary-btn" onClick={onEndGame}>End Game</button>
          <button className="secondary-btn" onClick={onReset}>Reset Game</button>
        </div>
      </div>

      <div className="card">
        <div className="title">Play-by-play</div>
        <div className="plays">
          {game.plays.slice().reverse().map((p: Play) => (
            <div key={p.id} className="play-item">
              <div style={{fontWeight:700}}>{p.inning}{p.half === 'away' ? 'T' : 'B'} • {p.batter} • {p.result}</div>
              <div className="small">Runs: {p.runs} Outs: {p.outs} Score: {p.scoreAfter.away}-{p.scoreAfter.home}</div>
              {p.note && <div className="small">Note: {p.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Report({ game, onBack }: { game: GameState; onBack: () => void }) {
  // compute simple stats
  const stats: Record<string, any> = {}
  game.plays.forEach(p => {
    if (!stats[p.batter]) stats[p.batter] = { pa:0, hits:0, walks:0, outs:0, runs:0, results:[] }
    const s = stats[p.batter]
    s.pa += 1
    if (['Single','Double','Triple','Home Run'].includes(p.result)) s.hits += 1
    if (p.result === 'Walk') s.walks += 1
    if (p.outs > 0) s.outs += p.outs
    s.runs += p.runs
    s.results.push(p.result + (p.note ? ' ('+p.note+')' : ''))
  })

  function copyShare() {
    try {
      const json = JSON.stringify(game)
      const compressed = compressToEncodedURIComponent(json)
      const url = location.origin + location.pathname + '#game=' + compressed
      navigator.clipboard.writeText(url)
      alert('Share link copied')
    } catch (e) { alert('Failed to copy') }
  }

  return (
    <div>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700,fontSize:18}}>{game.setup.title}</div>
            <div className="small">{game.setup.location}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontWeight:700,fontSize:18}}>{game.score.away} - {game.score.home}</div>
            <div className="small">Winner: {game.score.home > game.score.away ? game.setup.homeTeam : (game.score.away > game.score.home ? game.setup.awayTeam : 'Tie')}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="title">Player Summary</div>
        {Object.keys(stats).map(name => (
          <div key={name} className="play-item">
            <div style={{fontWeight:700}}>{name} — PA: {stats[name].pa} H: {stats[name].hits} BB: {stats[name].walks} Outs: {stats[name].outs} R: {stats[name].runs}</div>
            <div className="small">{stats[name].results.join(', ')}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{display:'flex',gap:8}}>
          <button className="big-btn" onClick={copyShare}>Copy Share Link</button>
          <button className="secondary-btn" onClick={onBack}>Back</button>
        </div>
      </div>

      <div className="card">
        <div className="title">Full Play-by-play</div>
        <div className="plays">
          {game.plays.map(p => (
            <div key={p.id} className="play-item">
              <div style={{fontWeight:700}}>{p.inning}{p.half === 'away' ? 'T' : 'B'} • {p.batter} • {p.result} • R:{p.runs} • O:{p.outs}</div>
              <div className="small">Score: {p.scoreAfter.away}-{p.scoreAfter.home} • Bases: {p.basesAfter.first||'-'}/{p.basesAfter.second||'-'}/{p.basesAfter.third||'-'}</div>
              {p.note && <div className="small">{p.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
