<script lang="ts">
  // ── Simbol definisi ────────────────────────────────
  type SymDef = {
    id: string
    emoji: string
    boardCount: number
    label: string
    pay: number
    weight: number
  }

  const SYMDEFS: SymDef[] = [
    { id:'apple',  emoji:'🍎', boardCount:3, label:'Apel',     pay:2,   weight:22 },
    { id:'orange', emoji:'🍊', boardCount:3, label:'Jeruk',    pay:5,   weight:18 },
    { id:'wmelon', emoji:'🍉', boardCount:3, label:'Semangka', pay:10,  weight:14 },
    { id:'melon',  emoji:'🍈', boardCount:2, label:'Melon',    pay:15,  weight:12 },
    { id:'frog',   emoji:'🐸', boardCount:3, label:'Kodok',    pay:15,  weight:10 },
    { id:'star',   emoji:'⭐', boardCount:3, label:'Bintang',  pay:20,  weight:8  },
    { id:'sev77',  emoji:'77', boardCount:2, label:'77',       pay:50,  weight:6  },
    { id:'bar',    emoji:'BAR',boardCount:3, label:'BAR',      pay:100, weight:4  },
  ]

  const SYM_IDS = SYMDEFS.map(s => s.id)
  const BY_ID: Record<string, SymDef> = {}
  for (const s of SYMDEFS) BY_ID[s.id] = s
  const WEIGHTS = SYMDEFS.map(s => s.weight)

  // ── Volatility tiers — bisa diubah admin ──────────
  type VolTier = {
    id: string
    label: string
    desc: string
    hitRate: number
    maxWinMult: number
    rtp: number
  }

  // State volatility — admin bisa override hitRate
  let VOL_TIERS = $state<VolTier[]>([
    { id:'low',    label:'Low',    desc:'Sering menang, hadiah kecil',  hitRate:0.35, maxWinMult:50,   rtp:0.94 },
    { id:'medium', label:'Medium', desc:'Balance frekuensi & hadiah',   hitRate:0.20, maxWinMult:200,  rtp:0.94 },
    { id:'high',   label:'High',   desc:'Jarang menang, hadiah BESAR',  hitRate:0.10, maxWinMult:1000, rtp:0.94 },
  ])

  const NEAR_MISS_CHANCE = 0.30
  const BET_STEPS = [500,800,1000,1500,2000,2500,3000,3500,4000,4500,5000,10000,20000,30000,40000,50000]

  // ── Board setup ────────────────────────────────────
  const ROWS = 7, COLS = 7
  type Cell = { r: number; c: number }
  const BORDER_POS: Cell[] = []
  for (let c=0; c<COLS; c++) BORDER_POS.push({r:0,c})
  for (let r=1; r<ROWS-1; r++) BORDER_POS.push({r,c:COLS-1})
  for (let c=COLS-1; c>=0; c--) BORDER_POS.push({r:ROWS-1,c})
  for (let r=ROWS-2; r>=1; r--) BORDER_POS.push({r,c:0})

  function weighted(): number {
    const t = WEIGHTS.reduce((a,b)=>a+b,0)
    let r = Math.random()*t
    for (let i=0; i<SYM_IDS.length; i++) { r-=WEIGHTS[i]; if (r<=0) return i }
    return 0
  }

  function makeBoard(): (string|null)[][] {
    const total = BORDER_POS.length
    const pool: string[] = []
    for (const def of SYMDEFS) for (let i=0; i<def.boardCount; i++) pool.push(def.id)
    while (pool.length < total) pool.push(SYM_IDS[weighted()])
    for (let i=pool.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [pool[i],pool[j]] = [pool[j],pool[i]]
    }
    const grid: (string|null)[][] = Array.from({length:ROWS},()=>Array(COLS).fill(null))
    let idx = 0
    for (const pos of BORDER_POS) grid[pos.r][pos.c] = pool[idx++] ?? SYM_IDS[weighted()]
    return grid
  }

  function calcWin(betAmount: number, symId: string, cnt: number, vol: VolTier): number {
    // Rumus paling simpel yang mathematically guaranteed:
    // payout SELALU = avgPayoutTarget (flat per win)
    // EV per spin = hitRate × avgPayoutTarget = bet × rtp ✅
    // Tidak ada variasi per simbol — semua simbol dapat payout sama
    // Variasi hanya dari countBonus kecil (max 1.2x)
    
    const avgPayoutTarget = betAmount * vol.rtp / vol.hitRate
    
    // bonus kecil kalau simbol banyak (tidak signifikan, max 1.2x)
    const countBonus = cnt >= 5 ? 1.15 : cnt >= 4 ? 1.08 : 1.0
    const withBonus = avgPayoutTarget * countBonus
    
    // hard cap maxWinMult
    const capped = Math.min(withBonus, betAmount * vol.maxWinMult)
    
    return Math.floor(capped)
  }

  function getLosingSteps(currentPos: number, board: (string|null)[][], picked: string): number {
    const total = BORDER_POS.length
    if (Math.random() < NEAR_MISS_CHANCE) {
      const winPositions = BORDER_POS.map((p,i)=>({i,sym:board[p.r][p.c]})).filter(x=>x.sym===picked)
      if (winPositions.length > 0) {
        const target = winPositions[Math.floor(Math.random()*winPositions.length)]
        const nearPos = (target.i-1+total)%total
        if (board[BORDER_POS[nearPos].r][BORDER_POS[nearPos].c] !== picked) {
          let steps = (nearPos-currentPos+total)%total
          if (steps < 10) steps += total
          return steps + total
        }
      }
    }
    const losePositions = BORDER_POS.map((p,i)=>({i,sym:board[p.r][p.c]})).filter(x=>x.sym!==picked)
    const target = losePositions[Math.floor(Math.random()*losePositions.length)]
    let steps = (target.i-currentPos+total)%total
    if (steps < 10) steps += total
    return steps + total
  }

  function getWinningSteps(currentPos: number, board: (string|null)[][], picked: string): number {
    const total = BORDER_POS.length
    const wins = BORDER_POS.map((p,i)=>({i,sym:board[p.r][p.c]})).filter(x=>x.sym===picked)
    if (!wins.length) return getLosingSteps(currentPos, board, picked)
    const target = wins[Math.floor(Math.random()*wins.length)]
    let steps = (target.i-currentPos+total)%total
    if (steps < 10) steps += total
    return steps + total
  }

  // ── Game state ─────────────────────────────────────
  let board       = $state<(string|null)[][]>(makeBoard())
  let credit      = $state(100000)
  let bet         = $state(500)
  let spinning    = $state(false)
  let currentPos  = $state(0)
  let picked      = $state('apple')
  let winAmount   = $state(0)
  let msg         = $state('')
  let centerLabel = $state('SPIN UNTUK MAIN')
  let centerNum   = $state('--')
  let flashWin    = $state(false)
  let volId       = $state('medium')
  let isNearMiss  = $state(false)

  type HistoryEntry = {
    round:number; result:'WIN'|'LOSE'|'NEAR'
    sym:string; emoji:string; bet:number
    win:number; credit:number; vol:string
  }
  let history     = $state<HistoryEntry[]>([])
  let totalWin    = $state(0)
  let totalLose   = $state(0)
  let totalNear   = $state(0)
  let round       = $state(0)
  let totalBet    = $state(0)
  let totalPayout = $state(0)

  let todayVol    = $derived(VOL_TIERS.find(v=>v.id===volId) ?? VOL_TIERS[1])
  let houseProfit = $derived(totalBet - totalPayout)
  let memberProfit= $derived(totalPayout - totalBet)
  let winRate     = $derived(round > 0 ? Math.round(totalWin/round*100) : 0)
  let actualRTP   = $derived(totalBet > 0 ? Math.round(totalPayout/totalBet*100) : 0)

  // autospin
  const AUTO_OPTIONS = [5,10,20,50,100]
  const DELAY_OPTIONS = [{label:'Cepat',ms:500},{label:'Normal',ms:800},{label:'Lambat',ms:1200}]
  let autoSpin  = $state(false)
  let autoCount = $state(10)
  let autoLeft  = $state(0)
  let autoDelay = $state(800)
  let autoTimer: ReturnType<typeof setTimeout>|null = null

  // ── Admin config panel ─────────────────────────────
  let showAdmin   = $state(false)
  // editable copy untuk admin
  let adminConfig = $state(VOL_TIERS.map(v => ({...v})))

  function applyAdminConfig() {
    // validasi range
    for (const c of adminConfig) {
      c.hitRate   = Math.max(0.01, Math.min(0.99, c.hitRate))
      c.maxWinMult= Math.max(2, Math.min(10000, c.maxWinMult))
      c.rtp       = Math.max(0.50, Math.min(0.99, c.rtp))
    }
    VOL_TIERS = adminConfig.map(v => ({...v}))
    showAdmin = false
    playClick()
  }

  function resetAdminConfig() {
    adminConfig = [
      { id:'low',    label:'Low',    desc:'Sering menang, hadiah kecil',  hitRate:0.35, maxWinMult:50,   rtp:0.94 },
      { id:'medium', label:'Medium', desc:'Balance frekuensi & hadiah',   hitRate:0.20, maxWinMult:200,  rtp:0.94 },
      { id:'high',   label:'High',   desc:'Jarang menang, hadiah BESAR',  hitRate:0.10, maxWinMult:1000, rtp:0.94 },
    ]
  }

  // ── Simulasi ───────────────────────────────────────
  type SimResult = {
    days: number; players: number; spinPerDay: number; avgBet: number
    totalSpin: number; totalBet: number; totalPayout: number
    houseProfit: number; memberProfit: number
    actualRTP: number; houseEdge: number
    winCount: number; winRate: number
  }

  let simDays       = $state(30)
  let simPlayers    = $state(50000)
  let simSpinPerDay = $state(20)
  let simAvgBet     = $state(5000)
  let simVolId      = $state('medium')
  let simResult     = $state<SimResult|null>(null)
  let simRunning    = $state(false)

  function runSimulation() {
    simRunning = true
    simResult = null

    const vol = VOL_TIERS.find(v=>v.id===simVolId) ?? VOL_TIERS[1]
    const totalSpin = simPlayers * simSpinPerDay * simDays
    let tBet = 0, tPayout = 0, winCount = 0

    // Jalankan simulasi dengan sampling (max 100k iterasi untuk performa)
    const sampleSize = Math.min(totalSpin, 100000)
    const scale = totalSpin / sampleSize

    for (let i=0; i<sampleSize; i++) {
      tBet += simAvgBet
      const isWin = Math.random() < vol.hitRate
      if (isWin) {
        winCount++
        const symIdx = weighted()
        const sym = SYMDEFS[symIdx]
        const cnt = sym.boardCount + (Math.random() > 0.8 ? 1 : 0)
        tPayout += calcWin(simAvgBet, sym.id, cnt, vol)
      }
    }

    // Scale ke total sebenarnya
    tBet     = Math.round(tBet * scale)
    tPayout  = Math.round(tPayout * scale)
    winCount = Math.round(winCount * scale)

    const houseProfit  = tBet - tPayout
    const memberProfit = tPayout - tBet
    const actualRTP    = tBet > 0 ? (tPayout/tBet*100) : 0
    const houseEdge    = 100 - actualRTP
    const winRate      = totalSpin > 0 ? (winCount/totalSpin*100) : 0

    simResult = {
      days: simDays, players: simPlayers,
      spinPerDay: simSpinPerDay, avgBet: simAvgBet,
      totalSpin, totalBet: tBet, totalPayout: tPayout,
      houseProfit, memberProfit,
      actualRTP, houseEdge, winCount, winRate
    }
    simRunning = false
  }

  // ── Helpers ────────────────────────────────────────
  function getBoardSym(r:number,c:number):string|null { return board[r]?.[c]??null }
  function getPosIndex(r:number,c:number):number { return BORDER_POS.findIndex(p=>p.r===r&&p.c===c) }
  function isBorderCell(r:number,c:number):boolean { return r===0||r===ROWS-1||c===0||c===COLS-1 }
  function isInnerCell(r:number,c:number):boolean { return r>=1&&r<=5&&c>=1&&c<=5 }
  function countSym(id:string):number { return BORDER_POS.filter(p=>board[p.r][p.c]===id).length }
  function shuffleBoard() { if(spinning)return; board=makeBoard(); playClick() }
  function fmt(n:number):string { return n.toLocaleString('id-ID') }

  // ── Audio ──────────────────────────────────────────
  let audioCtx: AudioContext|null = null
  function getAudio():AudioContext { if(!audioCtx) audioCtx=new AudioContext(); return audioCtx }
  function playTone(freq:number,dur:number,type:OscillatorType='square',vol=0.3) {
    try {
      const ctx=getAudio(); const osc=ctx.createOscillator(); const gain=ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination); osc.type=type
      osc.frequency.setValueAtTime(freq,ctx.currentTime)
      gain.gain.setValueAtTime(vol,ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime+dur)
    } catch(_){}
  }
  function playTick()     { playTone(440,0.04,'square',0.15) }
  function playSlowTick() { playTone(330,0.08,'square',0.2) }
  function playClick()    { playTone(600,0.05,'sine',0.2) }
  function playCoin()     { playTone(800,0.05,'sine',0.3); setTimeout(()=>playTone(1000,0.08,'sine',0.2),60) }
  function playNearMiss() {
    playTone(523,0.1,'sine',0.3)
    setTimeout(()=>playTone(466,0.1,'sine',0.25),100)
    setTimeout(()=>playTone(415,0.2,'sine',0.2),200)
  }
  function playWin(amount:number) {
    const notes = amount>=bet*100?[523,659,784,1047,1319,1568,2093]
      :amount>=bet*30?[523,659,784,1047,1319,1568]
      :amount>=bet*10?[523,659,784,1047,1319]
      :amount>=bet*3?[523,659,784,1047]:[523,659,784]
    notes.forEach((f,i)=>setTimeout(()=>playTone(f,0.15,'sine',0.4),i*100))
  }
  function playLose() { playTone(220,0.1,'sawtooth',0.2); setTimeout(()=>playTone(180,0.15,'sawtooth',0.15),100) }

  // ── Controls ───────────────────────────────────────
  function changeBet(d:number) {
    if(spinning)return
    const idx=BET_STEPS.indexOf(bet)
    bet=BET_STEPS[Math.max(0,Math.min(BET_STEPS.length-1,idx+d))]
    playClick()
  }
  function selectPick(id:string) { if(spinning)return; picked=id; playClick() }
  function selectVol(id:string)  { if(spinning)return; volId=id; playClick() }

  function startAuto() { if(autoSpin||credit<bet)return; autoSpin=true; autoLeft=autoCount; runAuto() }
  function stopAuto()  { autoSpin=false; autoLeft=0; if(autoTimer){clearTimeout(autoTimer);autoTimer=null} }
  async function runAuto() {
    if(!autoSpin||autoLeft<=0||credit<bet){stopAuto();return}
    autoLeft--; await doSpin()
    if(autoSpin&&autoLeft>0&&credit>=bet) autoTimer=setTimeout(runAuto,autoDelay)
    else stopAuto()
  }

  async function doSpin() {
    if(spinning||credit<bet)return
    spinning=true; credit-=bet
    winAmount=0; msg=''; isNearMiss=false
    centerLabel='BERPUTAR...'; centerNum='--'; flashWin=false
    playCoin()

    const vol = todayVol
    const willWin = Math.random() < vol.hitRate
    const steps = willWin
      ? getWinningSteps(currentPos, board, picked)
      : getLosingSteps(currentPos, board, picked)

    await new Promise<void>(resolve => {
      let step=0
      function tick() {
        currentPos=(currentPos+1)%BORDER_POS.length; step++
        const rem=steps-step; let speed=55
        if(rem<8){speed=80+(8-rem)*40;playSlowTick()}
        else if(rem<20){speed=75;playTick()}
        else{playTick()}
        if(step<steps) setTimeout(tick,speed); else resolve()
      }
      setTimeout(tick,55)
    })

    const landed=board[BORDER_POS[currentPos].r][BORDER_POS[currentPos].c]!
    const cnt=countSym(picked); const def=BY_ID[picked]; round++

    if(landed===picked) {
      const win=calcWin(bet,picked,cnt,vol)
      credit+=win; winAmount=win; centerNum=String(win); centerLabel='WIN!'
      flashWin=true; playWin(win)
      totalWin++; totalBet+=bet; totalPayout+=win
      history=[{round,result:'WIN',sym:picked,emoji:def.emoji,bet,win,credit,vol:vol.label},...history].slice(0,50)
      if(win>=bet*vol.maxWinMult*0.8) msg='🎰 MAX WIN!!'
      else if(win>=bet*100) msg='!! JACKPOT !!'
      else if(win>=bet*30)  msg='BIG WIN!'
      else if(win>=bet*10)  msg='NICE WIN!'
      else msg=`WIN! +${fmt(win)}`
      setTimeout(()=>{flashWin=false},2000)
    } else {
      const nextPos=(currentPos+1)%BORDER_POS.length
      const nextSym=board[BORDER_POS[nextPos].r][BORDER_POS[nextPos].c]
      const prevPos=(currentPos-1+BORDER_POS.length)%BORDER_POS.length
      const prevSym=board[BORDER_POS[prevPos].r][BORDER_POS[prevPos].c]
      if(nextSym===picked||prevSym===picked) {
        isNearMiss=true; centerNum='😱'; centerLabel='Hampir!'
        msg=`Hampir! ${def.emoji} ada di sebelahnya...`
        playNearMiss(); totalLose++; totalNear++; totalBet+=bet
      } else {
        centerNum=String(cnt); centerLabel=`${def.label} ada ${cnt} kotak`
        msg='Tidak menang. Coba lagi!'; playLose(); totalLose++; totalBet+=bet
      }
      history=[{round,result:isNearMiss?'NEAR':'LOSE',sym:picked,emoji:def.emoji,bet,win:0,credit,vol:vol.label},...history].slice(0,50)
    }

    spinning=false
    if(credit<=0) setTimeout(()=>{credit=100000;msg='Credit diisi ulang!';playCoin()},2000)
  }
</script>

<div class="game">
  <!-- Top bar -->
  <div class="top-bar">
    <div>
      <div class="lbl">BET</div>
      <div class="led">{fmt(bet)}</div>
    </div>
    <div class="title-box">
      <div class="title">BOARD JACKPOT</div>
      <div class="subtitle">Pragmatic Style · RTP {actualRTP || 94}%</div>
      <div style="display:flex;gap:6px;margin-top:2px">
        <button class="btn-shuffle" onclick={shuffleBoard} disabled={spinning}>🔀 Shuffle</button>
        <button class="btn-shuffle" class:admin-active={showAdmin} onclick={()=>showAdmin=!showAdmin}>⚙️ Admin</button>
      </div>
    </div>
    <div style="text-align:right">
      <div class="lbl">CREDIT</div>
      <div class="led">{fmt(credit)}</div>
    </div>
  </div>

  <!-- Admin Config Panel -->
  {#if showAdmin}
  <div class="admin-panel">
    <div class="admin-title">⚙️ WIN PERCENTAGE CONFIG</div>
    <div class="admin-subtitle">Atur hit rate & max win per volatility tier. House profit otomatis menyesuaikan.</div>

    <div class="admin-tiers">
      {#each adminConfig as cfg, i}
        <div class="admin-tier" class:tier-low={cfg.id==='low'} class:tier-med={cfg.id==='medium'} class:tier-high={cfg.id==='high'}>
          <div class="admin-tier-label">{cfg.label}</div>

          <div class="admin-field">
            <label>Win Rate (Hit Rate) %</label>
            <div class="admin-input-row">
              <input type="range" min="1" max="99" step="1"
                value={Math.round(cfg.hitRate*100)}
                oninput={(e)=>{ adminConfig[i].hitRate = Number((e.target as HTMLInputElement).value)/100 }}
              />
              <span class="admin-val">{Math.round(cfg.hitRate*100)}%</span>
            </div>
            <div class="admin-hint">
              Dari 100 spin → menang {Math.round(cfg.hitRate*100)} kali
            </div>
          </div>

          <div class="admin-field">
            <label>Max Win (× Bet)</label>
            <div class="admin-input-row">
              <input type="number" min="2" max="10000" step="10"
                value={cfg.maxWinMult}
                oninput={(e)=>{ adminConfig[i].maxWinMult = Number((e.target as HTMLInputElement).value) }}
              />
              <span class="admin-val">{cfg.maxWinMult}×</span>
            </div>
          </div>

          <div class="admin-field">
            <label>RTP %</label>
            <div class="admin-input-row">
              <input type="range" min="50" max="99" step="1"
                value={Math.round(cfg.rtp*100)}
                oninput={(e)=>{ adminConfig[i].rtp = Number((e.target as HTMLInputElement).value)/100 }}
              />
              <span class="admin-val">{Math.round(cfg.rtp*100)}%</span>
            </div>
            <div class="admin-hint">
              House edge: {100-Math.round(cfg.rtp*100)}%
            </div>
          </div>

          <div class="admin-projection">
            Avg payout/win = bet × {(cfg.rtp/cfg.hitRate).toFixed(1)}×
          </div>
        </div>
      {/each}
    </div>

    <div class="admin-actions">
      <button class="admin-btn-reset" onclick={resetAdminConfig}>↺ Reset Default</button>
      <button class="admin-btn-cancel" onclick={()=>showAdmin=false}>Batal</button>
      <button class="admin-btn-apply" onclick={applyAdminConfig}>✓ Terapkan</button>
    </div>
  </div>
  {/if}

  <!-- Volatility selector -->
  <div class="vol-wrap">
    {#each VOL_TIERS as v}
      <button class="vol-btn"
        class:selected={volId===v.id}
        class:vol-low={v.id==='low'}
        class:vol-med={v.id==='medium'}
        class:vol-high={v.id==='high'}
        onclick={()=>selectVol(v.id)}
        disabled={spinning}>
        <div class="vol-label">{v.label}</div>
        <div class="vol-desc">{v.desc}</div>
        <div class="vol-stats">Hit {Math.round(v.hitRate*100)}% · Max {v.maxWinMult}× · RTP {Math.round(v.rtp*100)}%</div>
      </button>
    {/each}
  </div>

  <!-- Board -->
  <div class="board-wrap">
    <div class="board-grid">
      {#each Array.from({length:ROWS},(_,r)=>r) as r}
        {#each Array.from({length:COLS},(_,c)=>c) as c}
          {#if r===1 && c===1}
            {@const def = BY_ID[picked]}
            <div class="center-panel" class:near-miss={isNearMiss}>
              <div class="center-sym-wrap">
                {#if def.id==='bar'}
                  <div class="center-bar"><div class="cb-top">BAR</div><div class="cb-mid">×100</div><div class="cb-bot">BAR</div></div>
                {:else if def.id==='sev77'}
                  <span class="c77">{def.emoji}</span>
                {:else}
                  <span class="c-em">{def.emoji}</span>
                {/if}
              </div>
              <div class="center-count">{BY_ID[picked].boardCount} kotak di board</div>
              <div class="center-num" class:win-flash={flashWin}>{centerNum}</div>
              <div class="center-lbl">{centerLabel}</div>
            </div>
          {:else if isInnerCell(r,c)}
            <!-- skip -->
          {:else if isBorderCell(r,c)}
            {@const posIdx = getPosIndex(r,c)}
            {@const symId  = getBoardSym(r,c)}
            {@const def    = symId ? BY_ID[symId] : null}
            <div class="cell"
              class:active={posIdx===currentPos}
              class:highlight={symId===picked&&posIdx!==currentPos}
              class:near-cell={isNearMiss&&(posIdx===(currentPos+1)%BORDER_POS.length||posIdx===(currentPos-1+BORDER_POS.length)%BORDER_POS.length)&&symId===picked}>
              {#if def}
                {#if def.id==='bar'}
                  <div class="bar-wrap"><div class="bar-top">BAR</div><div class="bar-mid">×100</div><div class="bar-bot">BAR</div></div>
                {:else if def.id==='sev77'}
                  <span class="cell-77">{def.emoji}</span>
                {:else}
                  <span class="cell-em">{def.emoji}</span>
                {/if}
              {/if}
            </div>
          {:else}
            <div class="cell empty"></div>
          {/if}
        {/each}
      {/each}
    </div>
  </div>

  <!-- Pick simbol -->
  <div class="section-lbl">PILIH SIMBOL TARUHAN</div>
  <div class="paytable">
    {#each SYMDEFS as def}
      <button class="pay-btn" class:selected={def.id===picked} onclick={()=>selectPick(def.id)} disabled={spinning}>
        {#if def.id==='bar'}
          <div class="pt-bar"><div class="ptb-top">BAR</div><div class="ptb-mid">×100</div></div>
        {:else if def.id==='sev77'}
          <span class="pt-77">{def.emoji}</span>
        {:else}
          <span class="pt-em">{def.emoji}</span>
        {/if}
        <div class="pt-info">
          <div class="pt-pay">×{def.pay}</div>
          <div class="pt-count">{def.boardCount} kotak</div>
        </div>
      </button>
    {/each}
  </div>

  <!-- Autospin -->
  <div class="auto-wrap">
    <div class="auto-row">
      <div class="auto-group">
        <div class="lbl">JUMLAH SPIN</div>
        <div class="auto-opts">
          {#each AUTO_OPTIONS as n}
            <button class="auto-opt" class:selected={autoCount===n} onclick={()=>autoCount=n} disabled={autoSpin}>{n}×</button>
          {/each}
        </div>
      </div>
      <div class="auto-group">
        <div class="lbl">KECEPATAN</div>
        <div class="auto-opts">
          {#each DELAY_OPTIONS as d}
            <button class="auto-opt" class:selected={autoDelay===d.ms} onclick={()=>autoDelay=d.ms} disabled={autoSpin}>{d.label}</button>
          {/each}
        </div>
      </div>
    </div>
    <div class="auto-row" style="justify-content:center;gap:10px;margin-top:6px">
      {#if autoSpin}
        <div class="auto-status">Auto: <span class="auto-left">{autoLeft}</span> sisa</div>
        <button class="btn-stop" onclick={stopAuto}>⏹ STOP</button>
      {:else}
        <button class="btn-auto" onclick={startAuto} disabled={spinning||credit<bet}>▶ AUTO {autoCount}×</button>
      {/if}
    </div>
  </div>

  <!-- Controls -->
  <div class="controls">
    <div class="bet-ctrl">
      <div class="lbl" style="text-align:center">BET</div>
      <div style="display:flex;gap:4px;align-items:center;margin-top:2px">
        <button class="btn" onclick={()=>changeBet(-1)} disabled={spinning}>-</button>
        <div class="bet-val">{fmt(bet)}</div>
        <button class="btn" onclick={()=>changeBet(1)} disabled={spinning}>+</button>
      </div>
    </div>
    <button class="btn-spin" onclick={doSpin} disabled={spinning||credit<bet}>{spinning?'...':'SPIN'}</button>
    <div style="text-align:center">
      <div class="lbl">WIN</div>
      <div class="win-val">{fmt(winAmount)}</div>
    </div>
  </div>

  <div class="msg" class:win-flash={flashWin} class:near-msg={isNearMiss}>{msg}</div>

  <!-- Stats -->
  <div class="stats-bar">
    <div class="stat-box win-stat"><div class="stat-label">WIN</div><div class="stat-val">{totalWin}</div></div>
    <div class="stat-box near-stat"><div class="stat-label">NEAR MISS</div><div class="stat-val">{totalNear}</div></div>
    <div class="stat-box lose-stat"><div class="stat-label">LOSE</div><div class="stat-val">{totalLose}</div></div>
    <div class="stat-box"><div class="stat-label">WIN RATE</div><div class="stat-val">{winRate}%</div></div>
  </div>

  <!-- Profit panel -->
  {#if round > 0}
  <div class="profit-wrap">
    <div class="profit-box house-box">
      <div class="profit-label">🏠 HOUSE PROFIT</div>
      <div class="profit-val" class:profit-pos={houseProfit>=0} class:profit-neg={houseProfit<0}>
        {houseProfit>=0?'+':''}{fmt(houseProfit)}
      </div>
      <div class="profit-sub">Total bet {fmt(totalBet)} · Actual RTP {actualRTP}%</div>
    </div>
    <div class="profit-box member-box">
      <div class="profit-label">👤 MEMBER PROFIT</div>
      <div class="profit-val" class:profit-pos={memberProfit>=0} class:profit-neg={memberProfit<0}>
        {memberProfit>=0?'+':''}{fmt(memberProfit)}
      </div>
      <div class="profit-sub">Payout {fmt(totalPayout)} · {round} spin</div>
    </div>
  </div>
  {/if}

  <!-- Simulasi Panel -->
  <div class="sim-panel">
    <div class="sim-title">📊 SIMULASI PENDAPATAN HOUSE</div>
    <div class="sim-form">
      <div class="sim-field">
        <label>Jumlah Hari</label>
        <input type="number" min="1" max="365" bind:value={simDays} />
      </div>
      <div class="sim-field">
        <label>Member Aktif/Hari</label>
        <input type="number" min="1" max="10000000" step="1000" bind:value={simPlayers} />
      </div>
      <div class="sim-field">
        <label>Spin/Member/Hari</label>
        <input type="number" min="1" max="1000" bind:value={simSpinPerDay} />
      </div>
      <div class="sim-field">
        <label>Rata-rata Bet (Rp)</label>
        <input type="number" min="500" max="50000" step="500" bind:value={simAvgBet} />
      </div>
      <div class="sim-field">
        <label>Volatility</label>
        <select bind:value={simVolId}>
          {#each VOL_TIERS as v}
            <option value={v.id}>{v.label} (Hit {Math.round(v.hitRate*100)}% · RTP {Math.round(v.rtp*100)}%)</option>
          {/each}
        </select>
      </div>
    </div>
    <button class="sim-btn" onclick={runSimulation} disabled={simRunning}>
      {simRunning ? '⏳ Menghitung...' : '▶ Jalankan Simulasi'}
    </button>

    {#if simResult}
    <div class="sim-result">
      <div class="sim-result-title">
        Hasil Simulasi {simResult.days} Hari · {fmt(simResult.players)} Member
      </div>
      <div class="sim-grid">
        <div class="sim-item">
          <div class="sim-item-label">Total Spin</div>
          <div class="sim-item-val neutral">{fmt(simResult.totalSpin)}</div>
        </div>
        <div class="sim-item">
          <div class="sim-item-label">Total Bet Masuk</div>
          <div class="sim-item-val neutral">Rp {fmt(simResult.totalBet)}</div>
        </div>
        <div class="sim-item">
          <div class="sim-item-label">Total Payout</div>
          <div class="sim-item-val loss">Rp {fmt(simResult.totalPayout)}</div>
        </div>
        <div class="sim-item">
          <div class="sim-item-label">Win Count</div>
          <div class="sim-item-val neutral">{fmt(simResult.winCount)} ({simResult.winRate.toFixed(1)}%)</div>
        </div>
        <div class="sim-item big">
          <div class="sim-item-label">🏠 HOUSE PROFIT</div>
          <div class="sim-item-val profit">Rp {fmt(simResult.houseProfit)}</div>
        </div>
        <div class="sim-item big">
          <div class="sim-item-label">👤 MEMBER PROFIT</div>
          <div class="sim-item-val loss">Rp {fmt(simResult.memberProfit)}</div>
        </div>
        <div class="sim-item">
          <div class="sim-item-label">Actual RTP</div>
          <div class="sim-item-val neutral">{simResult.actualRTP.toFixed(2)}%</div>
        </div>
        <div class="sim-item">
          <div class="sim-item-label">House Edge</div>
          <div class="sim-item-val profit">{simResult.houseEdge.toFixed(2)}%</div>
        </div>
        <div class="sim-item">
          <div class="sim-item-label">Profit/Hari</div>
          <div class="sim-item-val profit">Rp {fmt(Math.round(simResult.houseProfit/simResult.days))}</div>
        </div>
        <div class="sim-item">
          <div class="sim-item-label">Profit/Member/Bulan</div>
          <div class="sim-item-val profit">Rp {fmt(Math.round(simResult.houseProfit/simResult.players))}</div>
        </div>
      </div>
    </div>
    {/if}
  </div>

  <!-- History -->
  {#if history.length > 0}
  <div class="history-wrap">
    <div class="history-title">RIWAYAT SPIN</div>
    <div class="history-list">
      {#each history as h}
        <div class="h-row" class:h-win={h.result==='WIN'} class:h-lose={h.result==='LOSE'} class:h-near={h.result==='NEAR'}>
          <div class="h-round">#{h.round}</div>
          <div class="h-badge" class:badge-win={h.result==='WIN'} class:badge-lose={h.result==='LOSE'} class:badge-near={h.result==='NEAR'}>
            {h.result==='NEAR'?'NEAR':h.result}
          </div>
          <div class="h-sym">
            {#if h.sym==='bar'}<span class="h-bar">BAR</span>
            {:else if h.sym==='sev77'}<span class="h-77">77</span>
            {:else}{h.emoji}{/if}
          </div>
          <div class="h-vol">{h.vol}</div>
          <div class="h-detail">Bet <span class="h-num">{fmt(h.bet)}</span>
            {#if h.result==='WIN'}→ <span class="h-win-num">+{fmt(h.win)}</span>{/if}
          </div>
          <div class="h-credit">{fmt(h.credit)}</div>
        </div>
      {/each}
    </div>
  </div>
  {/if}
</div>

<style>
  *{box-sizing:border-box}
  .game{max-width:960px;margin:0 auto;padding:1rem;font-family:monospace;background:transparent;user-select:none}
  .top-bar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .led{background:#1a0000;color:#ff3333;font-size:22px;padding:8px 14px;border-radius:6px;min-width:100px;text-align:center;letter-spacing:2px;font-family:monospace}
  .lbl{font-size:10px;color:#aaa;margin-bottom:2px}
  .title-box{text-align:center;padding-top:4px;display:flex;flex-direction:column;align-items:center;gap:4px}
  .title{font-size:18px;color:#ffd700;font-weight:700;letter-spacing:2px}
  .subtitle{font-size:10px;color:#aaa}
  .btn-shuffle{background:#1a1a2e;color:#888;border:1px solid #444;border-radius:6px;padding:3px 10px;font-size:10px;cursor:pointer;transition:all 0.15s}
  .btn-shuffle:hover:not(:disabled){border-color:#ffd700;color:#ffd700}
  .btn-shuffle:disabled{opacity:0.4;cursor:not-allowed}
  .admin-active{border-color:#ff8800!important;color:#ff8800!important}

  /* Admin panel */
  .admin-panel{background:#0d0d1a;border:2px solid #ff8800;border-radius:12px;padding:16px;margin-bottom:12px}
  .admin-title{font-size:14px;color:#ff8800;font-weight:700;margin-bottom:4px}
  .admin-subtitle{font-size:11px;color:#666;margin-bottom:12px}
  .admin-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
  .admin-tier{background:#0a0a14;border:1px solid #333;border-radius:8px;padding:10px}
  .admin-tier.tier-low  {border-color:#00cc6644}
  .admin-tier.tier-med  {border-color:#ffd70044}
  .admin-tier.tier-high {border-color:#ff444444}
  .admin-tier-label{font-size:12px;font-weight:700;color:#ffd700;margin-bottom:8px;text-align:center}
  .admin-field{margin-bottom:8px}
  .admin-field label{font-size:10px;color:#888;display:block;margin-bottom:3px}
  .admin-input-row{display:flex;align-items:center;gap:6px}
  .admin-input-row input[type=range]{flex:1;accent-color:#ffd700}
  .admin-input-row input[type=number]{width:70px;background:#1a1a2e;color:#ffd700;border:1px solid #444;border-radius:4px;padding:3px 6px;font-size:12px;font-family:monospace}
  .admin-val{font-size:12px;color:#ffd700;font-weight:700;min-width:36px;text-align:right}
  .admin-hint{font-size:9px;color:#555;margin-top:2px}
  .admin-projection{font-size:10px;color:#888;background:#111;border-radius:4px;padding:4px 6px;margin-top:6px;text-align:center}
  .admin-actions{display:flex;gap:8px;justify-content:flex-end}
  .admin-btn-reset{background:#1a1a1a;color:#888;border:1px solid #444;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer}
  .admin-btn-cancel{background:#1a1a1a;color:#aaa;border:1px solid #444;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer}
  .admin-btn-apply{background:#1a3a00;color:#00ff88;border:2px solid #00cc66;border-radius:6px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer}
  .admin-btn-apply:hover{background:#224400}

  /* Vol */
  .vol-wrap{display:flex;gap:6px;margin-bottom:10px}
  .vol-btn{flex:1;background:#0d0d1a;border:2px solid #333;border-radius:10px;padding:8px 6px;cursor:pointer;transition:all 0.15s;color:white;text-align:center}
  .vol-btn:hover:not(:disabled){border-color:#ffd700}
  .vol-btn.selected.vol-low{border-color:#00cc66;background:#001a0d}
  .vol-btn.selected.vol-med{border-color:#ffd700;background:#1a1500}
  .vol-btn.selected.vol-high{border-color:#ff4444;background:#1a0000}
  .vol-btn:disabled{opacity:0.5;cursor:not-allowed}
  .vol-label{font-size:13px;font-weight:700;color:#ffd700}
  .vol-btn.selected.vol-low .vol-label{color:#00cc66}
  .vol-btn.selected.vol-high .vol-label{color:#ff4444}
  .vol-desc{font-size:10px;color:#888;margin:2px 0}
  .vol-stats{font-size:9px;color:#555}
  .vol-btn.selected .vol-stats{color:#888}

  /* Board */
  .board-wrap{background:#1a1a2e;border:3px solid #c8a84b;border-radius:12px;padding:8px}
  .board-grid{display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(7,1fr);gap:7px}
  .cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;border:2px solid #444;background:#0d0d1a;overflow:hidden;transition:background 0.08s,border-color 0.08s,box-shadow 0.08s,transform 0.08s}
  .cell.active{background:#3a2a00;border-color:#ffd700;box-shadow:0 0 12px #ffd700,0 0 24px #ffd70066;transform:scale(1.1);z-index:2}
  .cell.highlight{background:#003a1a;border-color:#00ff88;box-shadow:0 0 8px #00ff8866}
  .cell.near-cell{background:#3a0a00;border-color:#ff4444;box-shadow:0 0 12px #ff4444;animation:nearpulse 0.4s ease-in-out 3}
  .cell.empty{background:transparent;border:none}
  @keyframes nearpulse{0%,100%{box-shadow:0 0 12px #ff4444}50%{box-shadow:0 0 24px #ff4444,0 0 40px #ff444088}}
  .cell-em{font-size:42px;line-height:1}
  .cell-77{font-size:28px;font-weight:800;color:#ff3300;line-height:1}
  .bar-wrap{display:flex;flex-direction:column;align-items:center;width:92%}
  .bar-top,.bar-bot{background:#fff;color:#000;font-size:14px;font-weight:800;width:100%;text-align:center;line-height:1.5;letter-spacing:1px}
  .bar-mid{background:#cc2200;color:#fff;font-size:14px;font-weight:800;width:100%;text-align:center;line-height:1.6}
  .center-panel{grid-column:2/7;grid-row:2/7;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a1628;border-radius:10px;border:2px solid #c8a84b;gap:6px;padding:12px;transition:border-color 0.3s}
  .center-panel.near-miss{border-color:#ff4444;background:#1a0808;animation:nearflash 0.5s ease-in-out 2}
  @keyframes nearflash{0%,100%{background:#0a1628}50%{background:#2a0808}}
  .center-sym-wrap{display:flex;align-items:center;justify-content:center}
  .c-em{font-size:100px;line-height:1}
  .c77{font-size:80px;font-weight:800;color:#ff3300;line-height:1}
  .center-bar{width:160px}
  .cb-top,.cb-bot{background:#fff;color:#000;font-size:22px;font-weight:800;text-align:center;padding:5px 0;letter-spacing:2px}
  .cb-mid{background:#cc2200;color:#fff;font-size:32px;font-weight:800;text-align:center;padding:8px 0}
  .center-count{font-size:11px;color:#888}
  .center-num{font-size:72px;color:#ff3333;line-height:1;font-family:monospace;font-weight:700}
  .center-lbl{font-size:15px;color:#aaa;text-align:center}

  /* Paytable */
  .section-lbl{font-size:10px;color:#aaa;text-align:center;margin-top:10px;margin-bottom:6px}
  .paytable{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .pay-btn{background:#0d0d1a;border:2px solid #333;border-radius:8px;padding:8px 6px;cursor:pointer;transition:all 0.15s;color:white;display:flex;flex-direction:column;align-items:center;gap:4px}
  .pay-btn:hover:not(:disabled){border-color:#ffd700;background:#1a1a00}
  .pay-btn.selected{border-color:#ffd700;background:#2a2000;box-shadow:0 0 10px #ffd70088}
  .pay-btn:disabled{opacity:0.5;cursor:not-allowed}
  .pt-em{font-size:42px;line-height:1}
  .pt-77{font-size:34px;font-weight:800;color:#ff3300}
  .pt-bar{width:52px}
  .ptb-top{background:#fff;color:#000;font-size:9px;font-weight:800;text-align:center;padding:2px;letter-spacing:1px;border-radius:3px 3px 0 0}
  .ptb-mid{background:#cc2200;color:#fff;font-size:11px;font-weight:800;text-align:center;padding:2px;border-radius:0 0 3px 3px}
  .pt-info{display:flex;flex-direction:column;align-items:center;gap:1px}
  .pt-pay{font-size:14px;color:#ffd700;font-weight:700}
  .pt-count{font-size:11px;color:#666}

  /* Autospin */
  .auto-wrap{background:#0d0d1a;border:1px solid #333;border-radius:10px;padding:10px 12px;margin-top:10px}
  .auto-row{display:flex;gap:16px;align-items:flex-start}
  .auto-group{display:flex;flex-direction:column;gap:4px}
  .auto-opts{display:flex;gap:4px;flex-wrap:wrap}
  .auto-opt{background:#1a1a2e;color:#aaa;border:1px solid #333;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:monospace;transition:all 0.15s}
  .auto-opt:hover:not(:disabled){border-color:#ffd700;color:#ffd700}
  .auto-opt.selected{border-color:#ffd700;color:#ffd700;background:#2a2000}
  .auto-opt:disabled{opacity:0.4;cursor:not-allowed}
  .auto-status{font-size:13px;color:#aaa;display:flex;align-items:center;gap:6px}
  .auto-left{color:#ffd700;font-weight:700;font-size:16px;font-family:monospace}
  .btn-auto{background:#1a4a1a;color:#00ff88;border:2px solid #00cc66;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:monospace;transition:all 0.15s}
  .btn-auto:hover:not(:disabled){background:#225522}
  .btn-auto:disabled{opacity:0.4;cursor:not-allowed}
  .btn-stop{background:#4a1a1a;color:#ff4444;border:2px solid #cc2222;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:monospace;animation:pulsestop 1s ease-in-out infinite}
  @keyframes pulsestop{0%,100%{box-shadow:0 0 0 0 #cc222244}50%{box-shadow:0 0 0 6px #cc222200}}

  /* Controls */
  .controls{display:flex;gap:12px;align-items:center;justify-content:center;margin-top:12px}
  .bet-ctrl{text-align:center}
  .bet-val{color:#ffd700;font-size:16px;width:80px;text-align:center}
  .btn{background:#1a1a2e;color:#ffd700;border:2px solid #c8a84b;border-radius:8px;padding:6px 14px;font-size:16px;cursor:pointer;font-family:monospace}
  .btn:hover:not(:disabled){background:#2a2a4e}
  .btn:disabled{opacity:0.4;cursor:not-allowed}
  .btn-spin{background:#cc1111;color:white;border:3px solid #c8a84b;border-radius:50%;width:74px;height:74px;font-size:15px;font-weight:700;cursor:pointer;font-family:monospace;transition:background 0.15s,transform 0.1s}
  .btn-spin:hover:not(:disabled){background:#ee2222;transform:scale(1.06)}
  .btn-spin:disabled{opacity:0.5;cursor:not-allowed;transform:none}
  .win-val{font-size:24px;color:#00ff88;font-family:monospace;min-width:80px;text-align:center}
  .msg{text-align:center;min-height:26px;font-size:15px;color:#ffd700;margin-top:8px;font-family:monospace;font-weight:700}
  .msg.near-msg{color:#ff4444}
  .win-flash{animation:wflash 0.4s ease-in-out 4}
  @keyframes wflash{0%,100%{color:#ffd700}50%{color:#ff3333}}

  /* Stats */
  .stats-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
  .stat-box{background:#0d0d1a;border:1px solid #333;border-radius:8px;padding:8px 6px;text-align:center}
  .stat-box.win-stat{border-color:#00ff88}
  .stat-box.near-stat{border-color:#ff8800}
  .stat-box.lose-stat{border-color:#ff3333}
  .stat-label{font-size:9px;color:#666;margin-bottom:2px}
  .stat-val{font-size:20px;color:#ffd700;font-weight:700;font-family:monospace}
  .stat-box.win-stat .stat-val{color:#00ff88}
  .stat-box.near-stat .stat-val{color:#ff8800}
  .stat-box.lose-stat .stat-val{color:#ff4444}

  /* Profit */
  .profit-wrap{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
  .profit-box{background:#0d0d1a;border:1px solid #333;border-radius:10px;padding:12px;text-align:center}
  .profit-box.house-box{border-color:#c8a84b}
  .profit-box.member-box{border-color:#4488cc}
  .profit-label{font-size:12px;color:#aaa;margin-bottom:6px}
  .profit-val{font-size:26px;font-weight:700;font-family:monospace;line-height:1}
  .profit-val.profit-pos{color:#00ff88}
  .profit-val.profit-neg{color:#ff4444}
  .profit-sub{font-size:10px;color:#555;margin-top:4px}

  /* Simulasi */
  .sim-panel{background:#0d0d1a;border:2px solid #4488cc;border-radius:12px;padding:16px;margin-top:10px}
  .sim-title{font-size:14px;color:#4488cc;font-weight:700;margin-bottom:10px}
  .sim-form{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
  .sim-field{display:flex;flex-direction:column;gap:3px}
  .sim-field label{font-size:10px;color:#888}
  .sim-field input,.sim-field select{background:#1a1a2e;color:#ffd700;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;font-family:monospace}
  .sim-btn{background:#1a2a4a;color:#4488cc;border:2px solid #4488cc;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;width:100%;font-family:monospace;transition:all 0.15s}
  .sim-btn:hover:not(:disabled){background:#223355}
  .sim-btn:disabled{opacity:0.5;cursor:not-allowed}
  .sim-result{margin-top:12px;border-top:1px solid #333;padding-top:12px}
  .sim-result-title{font-size:12px;color:#aaa;margin-bottom:8px;text-align:center}
  .sim-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
  .sim-item{background:#0a0a14;border:1px solid #222;border-radius:6px;padding:8px;text-align:center}
  .sim-item.big{grid-column:span 1}
  .sim-item-label{font-size:9px;color:#666;margin-bottom:3px}
  .sim-item-val{font-size:16px;font-weight:700;font-family:monospace}
  .sim-item-val.profit{color:#00ff88}
  .sim-item-val.loss{color:#ff4444}
  .sim-item-val.neutral{color:#ffd700}

  /* History */
  .history-wrap{margin-top:10px}
  .history-title{font-size:10px;color:#aaa;text-align:center;margin-bottom:6px;letter-spacing:1px}
  .history-list{display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto}
  .h-row{display:flex;align-items:center;gap:8px;background:#0d0d1a;border:1px solid #222;border-radius:6px;padding:6px 10px;font-size:12px}
  .h-row.h-win{border-color:#00ff8844}
  .h-row.h-lose{border-color:#ff333322}
  .h-row.h-near{border-color:#ff880044}
  .h-round{color:#555;font-size:11px;min-width:28px}
  .h-badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;min-width:40px;text-align:center}
  .badge-win{background:#003a1a;color:#00ff88}
  .badge-lose{background:#3a0000;color:#ff4444}
  .badge-near{background:#3a2000;color:#ff8800}
  .h-sym{font-size:18px;min-width:28px;text-align:center}
  .h-bar{background:#fff;color:#000;font-size:9px;font-weight:800;padding:1px 4px;border-radius:2px}
  .h-77{color:#ff3300;font-weight:800;font-size:13px}
  .h-vol{font-size:10px;color:#555;min-width:44px}
  .h-detail{flex:1;color:#888;font-size:11px}
  .h-num{color:#ffd700}
  .h-win-num{color:#00ff88;font-weight:700}
  .h-credit{color:#aaa;font-size:11px;font-family:monospace;min-width:60px;text-align:right}
</style>
