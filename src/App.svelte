<script lang="ts">
  import logoUrl from './assets/logo2.png';
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

  const NEAR_MISS_CHANCE = 0.15  // 15% dari spin kalah → near miss
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

  // ── Per-simbol hit rate + volatility ──────────────
  // Prinsip: EV selalu = bet × rtp apapun tier yang dipilih
  //
  // Volatility mengubah hitRate DAN payout secara proporsional:
  //   LOW:  hitRate ×1.3, payoutMult ×0.77  → sering menang kecil
  //   MED:  hitRate ×1.0, payoutMult ×1.00  → balance
  //   HIGH: hitRate ×0.7, payoutMult ×1.43  → jarang menang besar
  //
  // Bukti EV tetap:
  //   EV = hitRate × payout
  //      = (base×volHit) × (basePay×volPay)
  //      = base×basePay × (volHit×volPay)
  //      = base×basePay × 1.0  ← volHit×volPay selalu = 1.0
  //   EV = bet × rtp ✅

  const VOL_MOD: Record<string, {hit: number, pay: number}> = {
    'low':    { hit: 1.30, pay: 0.769 },  // 1.30 × 0.769 ≈ 1.0
    'medium': { hit: 1.00, pay: 1.000 },  // 1.00 × 1.000 = 1.0
    'high':   { hit: 0.70, pay: 1.429 },  // 0.70 × 1.429 ≈ 1.0
  }

  function getSymHitRate(symId: string, vol: VolTier): number {
    const def = BY_ID[symId]
    // base hitRate agar EV = bet × rtp (tanpa volatility)
    const base = vol.rtp / def.pay
    // modifier volatility — EV tetap terjaga
    const mod = VOL_MOD[vol.id] ?? VOL_MOD['medium']
    return Math.min(Math.max(base * mod.hit, 0.001), 0.95)
  }

  function calcWin(betAmount: number, symId: string, vol: VolTier): number {
    const def = BY_ID[symId]
    // base payout = bet × pay
    const base = betAmount * def.pay
    // modifier volatility — naik/turun proporsional dengan hitRate
    const mod = VOL_MOD[vol.id] ?? VOL_MOD['medium']
    const adjusted = base * mod.pay
    // hard cap maxWinMult
    const capped = Math.min(adjusted, betAmount * vol.maxWinMult)
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

  let todayVol       = $derived(VOL_TIERS.find(v=>v.id===volId) ?? VOL_TIERS[1])
  // Font size credit otomatis menyesuaikan panjang angka
  let creditFontSize = $derived(
    fmt(displayCredit).length <= 7  ? '20px' :
    fmt(displayCredit).length <= 10 ? '15px' :
    fmt(displayCredit).length <= 13 ? '12px' : '10px'
  )
  let pickedDef    = $derived(BY_ID[picked])
  let pickedHR     = $derived(getSymHitRate(picked, todayVol))
  let potentialWin = $derived(bet * (BY_ID[picked]?.pay ?? 1))
  let houseProfit = $derived(totalBet - totalPayout)
  let memberProfit= $derived(totalPayout - totalBet)
  let winRate     = $derived(round > 0 ? Math.round(totalWin/round*100) : 0)
  let actualRTP   = $derived(totalBet > 0 ? Math.round(totalPayout/totalBet*100) : 0)

  // autospin
  const AUTO_OPTIONS = [5,10,20,50,100]
  const DELAY_OPTIONS = [{label:'Cepat',ms:500},{label:'Normal',ms:800},{label:'Lambat',ms:1200}]
  let autoSpin    = $state(false)
  let autoCount   = $state(10)
  let autoLeft    = $state(0)
  let autoDelay   = $state(800)
  let autoTimer: ReturnType<typeof setTimeout>|null = null

  // ── Credit roll animation ──────────────────────────
  let displayCredit = $state(credit)
  let creditRolling = $state(false)
  let creditDir     = $state<'up'|'down'|null>(null)  // naik atau turun
  let creditTimer: ReturnType<typeof setTimeout>|null = null

  function animateCredit(from: number, to: number) {
    if (from === to) return
    creditDir = to > from ? 'up' : 'down'
    creditRolling = true

    const diff = to - from
    const absDiff = Math.abs(diff)

    // Durasi lebih panjang — min 800ms, max 2.5 detik
    const duration = Math.min(Math.max(absDiff / 50, 800), 2500)
    // Steps lebih banyak untuk efek roll yang smooth
    const steps = Math.min(Math.max(Math.floor(absDiff / 100), 20), 60)
    const stepSize = diff / steps
    const stepDuration = duration / steps

    let current = from
    let step = 0

    if (creditTimer) clearInterval(creditTimer)
    creditTimer = setInterval(() => {
      step++
      // Easing — lambat di awal dan akhir (ease in-out)
      const progress = step / steps
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2
      displayCredit = Math.round(from + diff * ease)

      if (step >= steps) {
        displayCredit = to
        creditRolling = false
        creditDir = null
        clearInterval(creditTimer!)
        creditTimer = null
      }
    }, stepDuration)
  }

  // Watch credit changes
  let prevCredit = credit
  $effect(() => {
    if (credit !== prevCredit) {
      animateCredit(prevCredit, credit)
      prevCredit = credit
    }
  })

  // ── Stop Loss & Win Limit ──────────────────────────
  let useStopLoss   = $state(false)
  let stopLossPct   = $state(50)    // stop kalau modal turun X%
  let useWinLimit   = $state(false)
  let winLimitPct   = $state(100)   // stop kalau profit X%
  let autoStartCredit = $state(0)   // credit saat autospin dimulai
  let autoStopReason  = $state('')  // kenapa autospin berhenti

  function checkAutoLimits(): boolean {
    if (!useStopLoss && !useWinLimit) return false

    const currentProfit = credit - autoStartCredit
    const profitPct = (currentProfit / autoStartCredit) * 100

    // Stop loss check
    if (useStopLoss && profitPct <= -stopLossPct) {
      autoStopReason = `🛑 Stop Loss! Modal turun ${stopLossPct}% (${fmt(credit)} tersisa)`
      return true
    }

    // Win limit check
    if (useWinLimit && profitPct >= winLimitPct) {
      autoStopReason = `🎉 Win Limit! Profit sudah ${winLimitPct}% (Credit: ${fmt(credit)})`
      return true
    }

    return false
  }

  // ── Modal Topup & Info ─────────────────────────────
  let showTopup    = $state(false)
  let showInfo     = $state(false)
  let topupAmount  = $state(50000)
  let topupInput   = $state('')
  let topupError   = $state('')

  const TOPUP_PRESETS = [10000, 25000, 50000, 100000, 250000, 500000]

  function openTopup() {
    topupInput = ''
    topupError = ''
    showTopup = true
  }

  function doTopup(amount: number) {
    if (amount <= 0) { topupError = 'Jumlah harus lebih dari 0'; return }
    credit += amount
    topupError = ''
    topupInput = ''
    showTopup = false
    playWin(amount)
  }

  function doTopupCustom() {
    const val = parseInt(topupInput.replace(/\D/g,''))
    if (!val || val <= 0) { topupError = 'Masukkan jumlah yang valid'; return }
    if (val < 1000) { topupError = 'Minimal topup Rp 1.000'; return }
    doTopup(val)
  }

  // Auto buka topup kalau credit habis
  let creditWasEmpty = $state(false)
  $effect(() => {
    if (credit <= 0 && !creditWasEmpty) {
      creditWasEmpty = true
      setTimeout(() => { showTopup = true }, 1500)
    }
    if (credit > 0) creditWasEmpty = false
  })

  // ── Admin config panel ─────────────────────────────
  let showAdmin   = $state(false)
  let showSim     = $state(false)
  let showVol     = $state(false)
  let activeTab   = $state<'spin'|'auto'>('spin')
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

    // Simulasi — setiap spin pakai simbol random (weighted)
    // hitRate per simbol berbeda sesuai pay
    for (let i=0; i<sampleSize; i++) {
      tBet += simAvgBet
      // random simbol yang dipilih member (weighted by popularity)
      const symIdx = weighted()
      const sym = SYMDEFS[symIdx]
      const symHit = getSymHitRate(sym.id, vol)
      const isWin = Math.random() < symHit
      if (isWin) {
        winCount++
        tPayout += calcWin(simAvgBet, sym.id, vol)
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

  function startAuto() {
    if(autoSpin||credit<bet)return
    autoSpin=true
    autoLeft=autoCount
    autoStartCredit=credit
    autoStopReason=''
    runAuto()
  }
  function stopAuto()  { autoSpin=false; autoLeft=0; if(autoTimer){clearTimeout(autoTimer);autoTimer=null} }
  async function runAuto() {
    if(!autoSpin||autoLeft<=0||credit<bet){stopAuto();return}

    // Cek stop loss / win limit sebelum spin
    if (checkAutoLimits()) {
      msg = autoStopReason
      stopAuto()
      return
    }

    autoLeft--; await doSpin()

    // Cek lagi setelah spin
    if (checkAutoLimits()) {
      msg = autoStopReason
      stopAuto()
      return
    }

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
    // hitRate berbeda per simbol — simbol langka lebih jarang menang
    const symHitRate = getSymHitRate(picked, vol)
    const willWin = Math.random() < symHitRate
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
      const win=calcWin(bet,picked,vol)
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
    <!-- Row 1: BET | TITLE | CREDIT -->
    <div class="top-title">
      <div class="logo-wrapper">
        <img src="{logoUrl}" alt="Logo Aplikasi" class="main-logo" />
      </div>
      <div class="title"></div>
      <div class="subtitle">Pragmatic Style · RTP {actualRTP || 94}%</div>
    </div>
    <div class="top-row1">
      <div class="top-bet">
        <div class="lbl">BET</div>
        <div class="bet-row">
            <button class="btn-sm" onclick={()=>changeBet(-1)} disabled={spinning}>-</button>
            <div class="led">{fmt(bet)}</div>
            <button class="btn-sm" onclick={()=>changeBet(1)} disabled={spinning}>+</button>
        </div>
      </div>
      <div class="top-credit">
        <div class="lbl" style="text-align:right">CREDIT</div>
        <div
          class="led led-credit"
          class:led-low={credit < bet * 5}
          class:led-empty={credit <= 0}
          class:led-up={creditDir==='up'}
          class:led-down={creditDir==='down'}
          class:led-rolling={creditRolling}
          style="font-size:{creditFontSize}">{fmt(displayCredit)}</div>
      </div>
    </div>

    <!-- Row 2: action buttons (full width, centered) -->
    <div class="top-row2">
      <button class="btn-shuffle" onclick={shuffleBoard} disabled={spinning}>🔀</button>
      <button class="btn-shuffle" class:admin-active={showVol} onclick={()=>showVol=!showVol}>
        {#if volId==='low'}🟢{:else if volId==='high'}🔴{:else}🟡{/if}
        {VOL_TIERS.find(v=>v.id===volId)?.label}
      </button>
      <button class="btn-shuffle" class:admin-active={showAdmin} onclick={()=>showAdmin=!showAdmin}>⚙️</button>
      <button class="btn-shuffle" class:admin-active={showSim} onclick={()=>showSim=!showSim}>📊</button>
      <button class="btn-info-tog" onclick={()=>showInfo=!showInfo}>ℹ️</button>
      <button class="btn-topup" onclick={openTopup}>+ Topup</button>
    </div>
  </div>

  <!-- Modal Volatility -->
  {#if showVol}
  <div class="modal-overlay" onclick={()=>showVol=false}>
    <div class="modal-box" style="max-width:400px" onclick={(e)=>e.stopPropagation()}>
      <div class="modal-header">
        <div class="modal-title">📊 Pilih Volatility</div>
        <button class="modal-close" onclick={()=>showVol=false}>×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        {#each VOL_TIERS as v}
          <button
            class="vol-modal-btn"
            class:vol-modal-selected={volId===v.id}
            class:vol-modal-low={v.id==='low'}
            class:vol-modal-med={v.id==='medium'}
            class:vol-modal-high={v.id==='high'}
            onclick={()=>{ selectVol(v.id); showVol=false }}
          >
            <div class="vol-modal-top">
              <span class="vol-modal-label">{v.id==='low'?'🟢':v.id==='high'?'🔴':'🟡'} {v.label}</span>
              <span class="vol-modal-rtp">RTP {Math.round(v.rtp*100)}%</span>
            </div>
            <div class="vol-modal-desc">{v.desc}</div>
            <div class="vol-modal-stats">
              Win {Math.round(v.hitRate*100)}% · Max {v.maxWinMult}× bet
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
  {/if}



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



  <!-- Pick simbol — horizontal scroll 1 row -->
  <div class="section-lbl" style="margin-bottom:4px">PILIH SIMBOL TARUHAN</div>
  <div class="sym-slider">
    {#each SYMDEFS as def}
      {@const hr = getSymHitRate(def.id, todayVol)}
      <button class="sym-btn" class:selected={def.id===picked} onclick={()=>selectPick(def.id)} disabled={spinning}>
        {#if def.id==='bar'}
          <div class="sym-bar"><div class="sb-top">BAR</div><div class="sb-mid">×100</div></div>
        {:else if def.id==='sev77'}
          <span class="sym-77">{def.emoji}</span>
        {:else}
          <span class="sym-em">{def.emoji}</span>
        {/if}
        <div class="sym-pay">×{def.pay}</div>
        <div class="sym-hit">{(hr*100).toFixed(1)}%</div>
      </button>
    {/each}
  </div>

  <!-- Board -->
  <div class="board-wrap">
    <div class="board-grid">
      {#each Array.from({length:ROWS},(_,r)=>r) as r}
        {#each Array.from({length:COLS},(_,c)=>c) as c}
          {#if r===1 && c===1}
            <div class="center-panel" class:near-miss={isNearMiss}>
              <div class="center-sym-wrap">
                {#if pickedDef.id==='bar'}
                  <div class="center-bar"><div class="cb-top">BAR</div><div class="cb-mid">×100</div><div class="cb-bot">BAR</div></div>
                {:else if pickedDef.id==='sev77'}
                  <span class="c77">{pickedDef.emoji}</span>
                {:else}
                  <span class="c-em">{pickedDef.emoji}</span>
                {/if}
              </div>
              <div class="center-count">
                {pickedDef.boardCount} kotak · Win {(pickedHR*100).toFixed(1)}% · Payout ×{pickedDef.pay}
              </div>
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

  <!-- Tab Spin / Auto -->
  <div class="tab-wrap">
    <!-- Tab header -->
    <div class="tab-header">
      <button class="tab-btn" class:tab-active={activeTab==='spin'} onclick={()=>activeTab='spin'}>
        🎰 SPIN
      </button>
      <button class="tab-btn" class:tab-active={activeTab==='auto'} onclick={()=>activeTab='auto'}>
        ▶ AUTO SPIN
        {#if autoSpin}<span class="tab-badge">{autoLeft}</span>{/if}
      </button>
    </div>

    <!-- Tab content: SPIN -->
    {#if activeTab === 'spin'}
    <div class="tab-content">
      <div class="spin-row">
        <div class="bet-group">
          <div class="lbl">BET</div>
          <div class="bet-controls">
            <button class="btn" onclick={()=>changeBet(-1)} disabled={spinning}>-</button>
            <div class="bet-val">{fmt(bet)}</div>
            <button class="btn" onclick={()=>changeBet(1)} disabled={spinning}>+</button>
          </div>
        </div>
        <button class="btn-spin" onclick={doSpin} disabled={spinning||credit<bet}>
          {spinning ? '...' : 'SPIN'}
        </button>
        <div class="win-group">
          <div class="lbl">WIN</div>
          <div class="win-val">{fmt(winAmount)}</div>
        </div>
      </div>
      <div class="msg" class:win-flash={flashWin} class:near-msg={isNearMiss}>{msg}</div>
    </div>
    {/if}

    <!-- Tab content: AUTO SPIN -->
    {#if activeTab === 'auto'}
    <div class="tab-content">
      <!-- Bet di auto juga -->
      <div class="auto-bet-row">
        <div class="bet-group">
          <div class="lbl">BET PER SPIN</div>
          <div class="bet-controls">
            <button class="btn" onclick={()=>changeBet(-1)} disabled={autoSpin}>-</button>
            <div class="bet-val">{fmt(bet)}</div>
            <button class="btn" onclick={()=>changeBet(1)} disabled={autoSpin}>+</button>
          </div>
        </div>
        <div class="win-group">
          <div class="lbl">LAST WIN</div>
          <div class="win-val">{fmt(winAmount)}</div>
        </div>
      </div>

      <!-- Jumlah & kecepatan -->
      <div class="auto-opts-row">
        <div class="auto-group">
          <div class="lbl">JUMLAH</div>
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

      <!-- Stop Loss & Win Limit -->
      <div class="limit-row">
        <div class="limit-box" class:limit-active={useStopLoss}>
          <label class="limit-toggle">
            <input type="checkbox" bind:checked={useStopLoss} disabled={autoSpin} />
            <span class="limit-title loss-title">🛑 Stop Loss</span>
          </label>
          <span class="limit-desc">Stop kalau modal turun</span>
          {#if useStopLoss}
            <div class="limit-control">
              <input type="range" min="10" max="90" step="5" bind:value={stopLossPct} disabled={autoSpin} class="limit-range loss-range"/>
              <div class="limit-val-row">
                <span class="limit-val loss-val">{stopLossPct}%</span>
                <span class="limit-calc">Stop di Rp {fmt(Math.floor(credit*(1-stopLossPct/100)))}</span>
              </div>
            </div>
          {/if}
        </div>
        <div class="limit-box" class:limit-active={useWinLimit}>
          <label class="limit-toggle">
            <input type="checkbox" bind:checked={useWinLimit} disabled={autoSpin} />
            <span class="limit-title win-title">🎉 Win Limit</span>
          </label>
          <span class="limit-desc">Stop kalau sudah profit</span>
          {#if useWinLimit}
            <div class="limit-control">
              <input type="range" min="10" max="500" step="10" bind:value={winLimitPct} disabled={autoSpin} class="limit-range win-range"/>
              <div class="limit-val-row">
                <span class="limit-val win-val">{winLimitPct}%</span>
                <span class="limit-calc">Target Rp {fmt(Math.floor(credit*(1+winLimitPct/100)))}</span>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Auto button -->
      <div style="text-align:center;margin-top:10px">
        {#if autoSpin}
          <div class="auto-status-wrap">
            <div class="auto-status">Auto: <span class="auto-left">{autoLeft}</span> spin sisa</div>
            {#if useStopLoss || useWinLimit}
              <div class="auto-limit-status">
                {#if useStopLoss}<span class="ls-badge">🛑 SL {stopLossPct}%</span>{/if}
                {#if useWinLimit}<span class="wl-badge">🎉 WL +{winLimitPct}%</span>{/if}
              </div>
            {/if}
          </div>
          <button class="btn-stop" onclick={stopAuto} style="margin-top:8px">⏹ STOP AUTO</button>
        {:else}
          <button class="btn-auto" onclick={startAuto} disabled={spinning||credit<bet}>
            ▶ AUTO {autoCount}×
            {#if useStopLoss || useWinLimit}
              <span style="font-size:10px;opacity:0.8">
                {useStopLoss?`SL-${stopLossPct}%`:''}
                {useStopLoss&&useWinLimit?' · ':''}
                {useWinLimit?`WL+${winLimitPct}%`:''}
              </span>
            {/if}
          </button>
        {/if}
      </div>
      <div class="msg" class:win-flash={flashWin} class:near-msg={isNearMiss}>{msg}</div>
    </div>
    {/if}
  </div>




  <!-- Info Win Panel — collapsible -->
  <details class="info-panel">
    <summary class="info-summary">💡 INFO TARUHAN · {fmt(bet)} × {pickedDef.pay} = {fmt(potentialWin)}</summary>
    <div class="info-content">
      <div class="info-formula">
        <span class="info-bet">{fmt(bet)}</span>
        <span class="info-op">×</span>
        <span class="info-pay">{pickedDef.pay}</span>
        <span class="info-op">=</span>
        <span class="info-result">{fmt(potentialWin)}</span>
      </div>
      <div class="info-desc">
        Bet <strong>{fmt(bet)}</strong> pilih
        {#if pickedDef.id === 'bar'}
          <strong>BAR</strong>
        {:else if pickedDef.id === 'sev77'}
          <strong>77</strong>
        {:else}
          {pickedDef.emoji} <strong>{pickedDef.label}</strong>
        {/if}
        → kalau menang dapat
        <strong class="info-win-amount">Rp {fmt(potentialWin)}</strong>
      </div>
      <div class="info-stats">
        <div class="info-stat">
          <div class="info-stat-label">Peluang Menang</div>
          <div class="info-stat-val">{(pickedHR*100).toFixed(2)}%</div>
          <div class="info-stat-sub">~1 dari {Math.round(1/pickedHR)} spin</div>
        </div>
        <div class="info-stat-div"></div>
        <div class="info-stat">
          <div class="info-stat-label">Jika Kalah</div>
          <div class="info-stat-val loss-val">-{fmt(bet)}</div>
          <div class="info-stat-sub">bet hangus</div>
        </div>
        <div class="info-stat-div"></div>
        <div class="info-stat">
          <div class="info-stat-label">Jika Menang</div>
          <div class="info-stat-val win-val">+{fmt(potentialWin)}</div>
          <div class="info-stat-sub">×{pickedDef.pay} dari bet</div>
        </div>
        <div class="info-stat-div"></div>
        <div class="info-stat">
          <div class="info-stat-label">Volatility</div>
          <div class="info-stat-val">{todayVol.label}</div>
          <div class="info-stat-sub">RTP {Math.round(todayVol.rtp*100)}%</div>
        </div>
      </div>
      <div class="info-note">
        Rata-rata menang setiap <strong>{Math.round(1/pickedHR)}</strong> spin ·
        Modal <strong>{fmt(bet * Math.round(1/pickedHR))}</strong> untuk 1 kemenangan
      </div>
    </div>
  </details>

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
</div>
  <!-- Simulasi Panel -->
  <!-- Modal Simulasi -->
  {#if showSim}
  <div class="modal-overlay" onclick={()=>showSim=false}>
    <div class="modal-box" onclick={(e)=>e.stopPropagation()} style="max-width:520px">
      <div class="modal-header">
        <div class="modal-title">📊 SIMULASI PENDAPATAN HOUSE</div>
        <button class="modal-close" onclick={()=>showSim=false}>×</button>
      </div>
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
  </div>
  {/if}

  <!-- Modal Topup -->
  {#if showTopup}
  <div class="modal-overlay" onclick={()=>{ if(credit > 0) showTopup=false }}>
    <div class="modal-box" onclick={(e)=>e.stopPropagation()}>
      <div class="modal-header">
        <div class="modal-title">
          {#if credit <= 0}
            😢 Credit Habis!
          {:else}
            💳 Topup Credit
          {/if}
        </div>
        {#if credit > 0}
          <button class="modal-close" onclick={()=>showTopup=false}>×</button>
        {/if}
      </div>

      {#if credit <= 0}
        <div class="modal-empty-msg">
          Credit kamu sudah habis. Topup untuk lanjut main!
        </div>
      {/if}

      <div class="modal-credit-now">
        Saldo sekarang: <span class="modal-credit-val">{fmt(credit)}</span>
      </div>

      <!-- Preset amounts -->
      <div class="topup-label">Pilih nominal:</div>
      <div class="topup-presets">
        {#each TOPUP_PRESETS as preset}
          <button
            class="topup-preset"
            class:topup-selected={topupAmount === preset}
            onclick={()=>{ topupAmount=preset; topupError='' }}
          >
            Rp {fmt(preset)}
          </button>
        {/each}
      </div>

      <!-- Custom input -->
      <div class="topup-label" style="margin-top:10px">Atau masukkan nominal sendiri:</div>
      <div class="topup-custom-row">
        <span class="topup-rp">Rp</span>
        <input
          class="topup-input"
          type="text"
          placeholder="Contoh: 75000"
          bind:value={topupInput}
          oninput={()=>{ topupError=''; topupAmount=0 }}
          onkeydown={(e)=>{ if(e.key==='Enter') topupInput ? doTopupCustom() : doTopup(topupAmount) }}
        />
      </div>

      {#if topupError}
        <div class="topup-error">{topupError}</div>
      {/if}

      <!-- Info -->
      <div class="topup-info">
        {#if topupInput}
          {@const val = parseInt(topupInput.replace(/\D/g,'')) || 0}
          Setelah topup: <strong>Rp {fmt(credit + val)}</strong>
        {:else if topupAmount > 0}
          Setelah topup: <strong>Rp {fmt(credit + topupAmount)}</strong>
        {/if}
      </div>

      <button
        class="topup-btn"
        onclick={()=> topupInput ? doTopupCustom() : doTopup(topupAmount)}
      >
        + Topup {topupInput ? `Rp ${fmt(parseInt(topupInput.replace(/\D/g,''))||0)}` : `Rp ${fmt(topupAmount)}`}
      </button>
    </div>
  </div>
  {/if}

  <!-- Modal Info Game -->
  {#if showInfo}
  <div class="modal-overlay" onclick={()=>showInfo=false}>
    <div class="modal-box modal-info-box" onclick={(e)=>e.stopPropagation()}>
      <div class="modal-header">
        <div class="modal-title">ℹ️ Cara Main</div>
        <button class="modal-close" onclick={()=>showInfo=false}>×</button>
      </div>

      <div class="info-sections">
        <div class="info-section">
          <div class="info-sec-title">🎮 Cara Bermain</div>
          <ol class="info-list">
            <li>Pilih <strong>simbol</strong> yang mau kamu taruhan</li>
            <li>Set <strong>jumlah bet</strong> pakai tombol - dan +</li>
            <li>Pilih <strong>volatility</strong> (Low/Medium/High)</li>
            <li>Tekan <strong>SPIN</strong> atau aktifkan <strong>AUTO SPIN</strong></li>
            <li>Kalau pointer berhenti di simbol pilihanmu → <strong>MENANG!</strong></li>
          </ol>
        </div>

        <div class="info-section">
          <div class="info-sec-title">💰 Tabel Kemenangan</div>
          <div class="info-pay-table">
            {#each SYMDEFS as def}
              <div class="info-pay-row">
                <div class="info-pay-sym">
                  {#if def.id==='bar'}<span class="ibar">BAR</span>
                  {:else if def.id==='sev77'}<span class="i77">77</span>
                  {:else}{def.emoji}{/if}
                </div>
                <div class="info-pay-name">{def.label}</div>
                <div class="info-pay-mult">×{def.pay}</div>
                <div class="info-pay-win">
                  Bet {fmt(bet)} → <span class="info-pay-result">Rp {fmt(bet*def.pay)}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="info-section">
          <div class="info-sec-title">📊 Volatility</div>
          <div class="info-vol-table">
            {#each VOL_TIERS as v}
              <div class="info-vol-row" class:info-vol-active={volId===v.id}>
                <div class="info-vol-name">{v.label}</div>
                <div class="info-vol-desc">{v.desc}</div>
                <div class="info-vol-stats">
                  Win {Math.round(getSymHitRate(picked,v)*100)}% · Max {v.maxWinMult}× · RTP {Math.round(v.rtp*100)}%
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="info-section">
          <div class="info-sec-title">💡 Tips</div>
          <ul class="info-list">
            <li>Simbol <strong>langka</strong> (BAR, 77) → hadiah besar tapi jarang menang</li>
            <li>Simbol <strong>umum</strong> (Apel, Jeruk) → sering menang tapi hadiah kecil</li>
            <li><strong>Near Miss</strong> 😱 = pointer hampir di simbol kamu, spin lagi!</li>
            <li><strong>Low vol</strong> = cocok untuk main lama dengan modal kecil</li>
            <li><strong>High vol</strong> = cocok untuk kejar jackpot besar</li>
            <li>Gunakan <strong>Auto Spin</strong> untuk spin otomatis</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  {/if}






<style>
  :global(*){box-sizing:border-box}
  :global(body,html){background:#111118!important;margin:0;padding:0;min-height:100vh}
  :global(#app){background:#111118!important;min-height:100vh}
  :global(meta[name=theme-color]){content:#111118}
  .game{max-width:640px;margin:0 auto;padding:0.75rem;font-family:monospace;background:#111118;user-select:none;min-height:100vh}
  .top-bar {
    display: flex;
    flex-direction: column;
    gap: 14px; /* Memberi jarak konsisten antar baris */
    margin-bottom: 12px;
    width: 100%;
  }
  .logo-wrapper {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    
    /* PERUBAHAN UTAMA: Naikkan tinggi container agar gambar bisa mekar maksimal */
    height: 120px; 
    width: 100%;
    
    /* Memberikan ruang/jarak dari batas paling atas layar supaya logo turun */
    padding-top: 10px; 
    
    /* Jarak aman ke teks bawah (Pragmatic Style...) */
    margin-bottom: 5px;
  }
  .main-logo {
   position: relative;
  
  /* Menghilangkan properti height: 100% lama agar tidak terkunci */
  height: auto; 
  
  /* Set lebar dasar logo sebelum di-scale */
  width: 180px;  
  object-fit: contain;
  
  /* PERUBAHAN UTAMA: Naikkan angka scale jika ingin gambar jauh lebih besar */
  transform: scale(1.6); 
  transform-origin: center center;
  
  /* Efek glow tipis di sekitar logo */
  filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.4));
}
  .top-row1 {
    display: flex;
  align-items: center;
  justify-content: space-between; /* Mendorong BET ke ujung kiri & CREDIT ke ujung kanan */
  width: 100%;
  }
  .top-bet {
    display: flex;
    flex-direction: column;
    align-items: flex-start; /* Konten internal BET rata kiri */
    gap: 4px;
  }
  .lbl {
    color: #8a8a9e;
    font-size: 11px;
    font-weight: bold;
  }
  .top-credit {
    display: flex;
    flex-direction: column;
    align-items: flex-end; /* Konten internal CREDIT rata kanan */
    gap: 4px;
  }
  .bet-row{display:flex;gap:3px;align-items:center}
  .top-title {
    display: flex;
    flex-direction: column;
    align-items: center; /* Membuat teks ke tengah secara horizontal */
    text-align: center;   /* Memastikan baris teks rata tengah */
    width: 100%;
  }
  .title {
    color: #ffd700;
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .subtitle {
    color: #8a8a9e;
    font-size: 11px;
    margin-top: 2px;
  }
  .bet-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  /* Tombol Plus Minus (-) (+) */
  .btn-sm {
    background: #1a1a2e;
    color: #ffd700;
    border: 2px solid #c8a84b;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-sm:hover:not(:disabled) {
    background: #c8a84b;
    color: #1a1a2e;
  }
  .btn-sm:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .top-credit{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0}
  .top-row2 {
    display: flex;
    justify-content: center; /* Membuat semua tombol berkumpul di tengah */
    align-items: center;
    gap: 6px; /* Jarak antar tombol ikon */
    width: 100%;
    flex-wrap: wrap; /* Supaya aman jika layar handphone terlalu kecil */
  }
  .btn-sm{background:#1a1a2e;color:#ffd700;border:2px solid #c8a84b;border-radius:6px;padding:4px 10px;font-size:14px;cursor:pointer;font-family:monospace}
  .btn-sm:hover:not(:disabled){background:#2a2a4e}
  .btn-sm:disabled{opacity:0.4;cursor:not-allowed}

  /* Volatility modal */
  .vol-modal-btn{width:100%;background:#0d0d1a;border:2px solid #333;border-radius:10px;padding:10px 14px;cursor:pointer;transition:all 0.15s;color:white;text-align:left}
  .vol-modal-btn:hover{border-color:#ffd700}
  .vol-modal-btn.vol-modal-selected{box-shadow:0 0 12px #ffd70066}
  .vol-modal-btn.vol-modal-low.vol-modal-selected{border-color:#00cc66;background:#001a0d}
  .vol-modal-btn.vol-modal-med.vol-modal-selected{border-color:#ffd700;background:#1a1500}
  .vol-modal-btn.vol-modal-high.vol-modal-selected{border-color:#ff4444;background:#1a0000}
  .vol-modal-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
  .vol-modal-label{font-size:14px;font-weight:700;color:#ffd700}
  .vol-modal-btn.vol-modal-low.vol-modal-selected .vol-modal-label{color:#00cc66}
  .vol-modal-btn.vol-modal-high.vol-modal-selected .vol-modal-label{color:#ff4444}
  .vol-modal-rtp{font-size:11px;color:#888}
  .vol-modal-desc{font-size:12px;color:#aaa;margin-bottom:3px}
  .vol-modal-stats{font-size:10px;color:#666}
  .led{background:#1a0000;color:#ff3333;font-size:18px;padding:6px 10px;border-radius:6px;min-width:70px;max-width:140px;width:auto;text-align:center;letter-spacing:1px;font-family:monospace;white-space:nowrap}
  .lbl{font-size:10px;color:#aaa;margin-bottom:2px}
  .title-box{text-align:center;padding-top:4px;display:flex;flex-direction:column;align-items:center;gap:4px}
  .title{font-size:15px;color:#ffd700;font-weight:700;letter-spacing:1px}
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
  /* vol-wrap removed */

  /* Board */
  .board-wrap{background:#1a1a2e;border:3px solid #c8a84b;border-radius:12px;padding:8px}
  .board-grid{display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(7,1fr);gap:7px}
  .cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;border:2px solid #444;background:#0d0d1a;overflow:hidden;transition:background 0.08s,border-color 0.08s,box-shadow 0.08s,transform 0.08s}
  .cell.active{background:#3a2a00;border-color:#ffd700;box-shadow:0 0 12px #ffd700,0 0 24px #ffd70066;transform:scale(1.1);z-index:2}
  .cell.highlight{background:#003a1a;border-color:#00ff88;box-shadow:0 0 8px #00ff8866}
  .cell.near-cell{background:#3a0a00;border-color:#ff4444;box-shadow:0 0 12px #ff4444;animation:nearpulse 0.4s ease-in-out 3}
  .cell.empty{background:transparent;border:none}
  @keyframes nearpulse{0%,100%{box-shadow:0 0 12px #ff4444}50%{box-shadow:0 0 24px #ff4444,0 0 40px #ff444088}}
  .cell-em{font-size:clamp(18px,4vw,42px);line-height:1}
  .cell-77{font-size:clamp(12px,2.5vw,28px);font-weight:800;color:#ff3300;line-height:1}
  .bar-wrap{display:flex;flex-direction:column;align-items:center;width:92%}
  .bar-top,.bar-bot{background:#fff;color:#000;font-size:14px;font-weight:800;width:100%;text-align:center;line-height:1.5;letter-spacing:1px}
  .bar-mid{background:#cc2200;color:#fff;font-size:14px;font-weight:800;width:100%;text-align:center;line-height:1.6}
  .center-panel{grid-column:2/7;grid-row:2/7;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a1628;border-radius:10px;border:2px solid #c8a84b;gap:6px;padding:12px;transition:border-color 0.3s}
  .center-panel.near-miss{border-color:#ff4444;background:#1a0808;animation:nearflash 0.5s ease-in-out 2}
  @keyframes nearflash{0%,100%{background:#0a1628}50%{background:#2a0808}}
  .center-sym-wrap{display:flex;align-items:center;justify-content:center}
  .c-em{font-size:clamp(48px,12vw,100px);line-height:1}
  .c77{font-size:clamp(40px,10vw,80px);font-weight:800;color:#ff3300;line-height:1}
  .center-bar{width:160px}
  .cb-top,.cb-bot{background:#fff;color:#000;font-size:22px;font-weight:800;text-align:center;padding:5px 0;letter-spacing:2px}
  .cb-mid{background:#cc2200;color:#fff;font-size:32px;font-weight:800;text-align:center;padding:8px 0}
  .center-count{font-size:11px;color:#888}
  .center-num{font-size:clamp(36px,8vw,72px);color:#ff3333;line-height:1;font-family:monospace;font-weight:700}
  .center-lbl{font-size:15px;color:#aaa;text-align:center}

  /* Paytable */
  .section-lbl{font-size:10px;color:#aaa;text-align:center;margin-top:10px;margin-bottom:6px}
  /* Sym slider — horizontal scroll 1 row */
  .sym-slider{display:flex;gap:6px;overflow-x:auto;padding:4px 2px 8px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .sym-slider::-webkit-scrollbar{display:none}
  .sym-btn{flex:0 0 64px;background:#0d0d1a;border:2px solid #333;border-radius:8px;padding:6px 4px;cursor:pointer;transition:all 0.15s;color:white;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:64px}
  .sym-btn:hover:not(:disabled){border-color:#ffd700;background:#1a1a00}
  .sym-btn.selected{border-color:#ffd700;background:#2a2000;box-shadow:0 0 10px #ffd70088}
  .sym-btn:disabled{opacity:0.5;cursor:not-allowed}
  .sym-em{font-size:28px;line-height:1}
  .sym-77{font-size:20px;font-weight:800;color:#ff3300;line-height:1}
  .sym-bar{width:48px}
  .sb-top{background:#fff;color:#000;font-size:8px;font-weight:800;text-align:center;padding:2px;letter-spacing:1px;border-radius:3px 3px 0 0}
  .sb-mid{background:#cc2200;color:#fff;font-size:9px;font-weight:800;text-align:center;padding:2px;border-radius:0 0 3px 3px}
  .sym-pay{font-size:12px;color:#ffd700;font-weight:700;line-height:1}
  .sym-hit{font-size:9px;color:#888;line-height:1}

  /* Info Panel collapsible */
  .info-panel{background:#0d0d1a;border:2px solid #c8a84b44;border-radius:12px;margin-top:10px}
  .info-panel[open]{padding-bottom:14px}
  .info-summary{padding:12px 14px;font-size:12px;color:#c8a84b;font-weight:700;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}
  .info-summary::-webkit-details-marker{display:none}
  .info-summary::after{content:'▼';margin-left:auto;font-size:10px;color:#555}
  .info-panel[open] .info-summary::after{content:'▲'}
  .info-content{padding:0 14px}
  .sim-summary{font-size:13px;color:#4488cc;font-weight:700;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;padding:4px 0 10px}
  .sim-summary::-webkit-details-marker{display:none}
  .sim-summary::after{content:'▼';margin-left:auto;font-size:10px;color:#555}
  .sim-panel[open] .sim-summary::after{content:'▲'}

  /* Info Panel */
  .info-title{font-size:12px;color:#c8a84b;font-weight:700;margin-bottom:10px;letter-spacing:1px}
  .info-content{display:flex;flex-direction:column;gap:10px}
  .info-formula{display:flex;align-items:center;justify-content:center;gap:12px;background:#111;border-radius:8px;padding:12px}
  .info-bet{font-size:24px;color:#ffd700;font-weight:700;font-family:monospace}
  .info-op{font-size:20px;color:#555;font-weight:700}
  .info-pay{font-size:24px;color:#4488cc;font-weight:700;font-family:monospace}
  .info-result{font-size:28px;color:#00ff88;font-weight:700;font-family:monospace}
  .info-desc{font-size:13px;color:#aaa;text-align:center;line-height:1.6}
  .info-win-amount{color:#00ff88;font-size:15px}
  .info-stats{display:flex;align-items:center;gap:0;background:#111;border-radius:8px;overflow:hidden}
  .info-stat{flex:1;text-align:center;padding:10px 6px}
  .info-stat-div{width:1px;background:#222;align-self:stretch}
  .info-stat-label{font-size:9px;color:#666;margin-bottom:4px}
  .info-stat-val{font-size:16px;color:#ffd700;font-weight:700;font-family:monospace}
  .info-stat-val.win-val{color:#00ff88}
  .info-stat-val.loss-val{color:#ff4444}
  .info-stat-sub{font-size:9px;color:#555;margin-top:2px}
  .info-note{font-size:11px;color:#666;text-align:center;padding:6px;background:#111;border-radius:6px}
  .info-note strong{color:#aaa}

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

  /* Tab system */
  .tab-wrap{background:#0d0d1a;border:1px solid #333;border-radius:12px;overflow:hidden;margin-top:8px}
  .tab-header{display:flex;border-bottom:1px solid #222}
  .tab-btn{flex:1;background:none;border:none;color:#666;font-size:13px;font-weight:700;padding:10px;cursor:pointer;font-family:monospace;transition:all 0.15s;border-bottom:2px solid transparent}
  .tab-btn:hover{color:#aaa;background:#ffffff08}
  .tab-btn.tab-active{color:#ffd700;border-bottom-color:#ffd700;background:#ffffff05}
  .tab-badge{background:#ff3333;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;margin-left:4px;vertical-align:middle}
  .tab-content{padding:12px}
  .spin-row{display:flex;align-items:center;justify-content:center;gap:16px}
  .bet-group{display:flex;flex-direction:column;align-items:center;gap:4px}
  .bet-controls{display:flex;gap:4px;align-items:center}
  .win-group{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:60px}
  .auto-bet-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #222}
  .auto-opts-row{display:flex;gap:12px;margin-bottom:10px}

  /* Stop Loss & Win Limit */
  .limit-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
  .limit-box{background:#0a0a14;border:1px solid #222;border-radius:8px;padding:10px}
  .limit-box.limit-active{border-color:#444}
  .limit-header{display:flex;flex-direction:column;gap:3px;margin-bottom:0}
  .limit-toggle{display:flex;align-items:center;gap:6px;cursor:pointer}
  .limit-toggle input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#ffd700}
  .limit-title{font-size:12px;font-weight:700}
  .loss-title{color:#ff4444}
  .win-title{color:#00ff88}
  .limit-desc{font-size:10px;color:#555;padding-left:20px}
  .limit-control{margin-top:8px}
  .limit-range{width:100%;accent-color:#ffd700}
  .loss-range{accent-color:#ff4444}
  .win-range{accent-color:#00ff88}
  .limit-val-row{display:flex;justify-content:space-between;align-items:center;margin-top:4px}
  .limit-val{font-size:14px;font-weight:700;font-family:monospace}
  .loss-val{color:#ff4444}
  .win-val{color:#00ff88}
  .limit-calc{font-size:10px;color:#666}
  .auto-status-wrap{display:flex;flex-direction:column;gap:4px;align-items:center}
  .auto-limit-status{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
  .ls-badge{font-size:10px;color:#ff4444;background:#3a000033;padding:2px 8px;border-radius:4px;border:1px solid #ff444433}
  .wl-badge{font-size:10px;color:#00ff88;background:#003a1a33;padding:2px 8px;border-radius:4px;border:1px solid #00ff8833}

  /* Controls */
  .controls{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:8px}
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
  .sim-panel{background:#0d0d1a;border:2px solid #4488cc;border-radius:12px;padding:12px 16px;margin-top:10px}
  .sim-title{font-size:14px;color:#4488cc;font-weight:700;margin-bottom:10px}
  .sim-form{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:10px}
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
  .history-list{display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto}
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

  /* LED states */
  .led-credit{transition:color 0.2s;position:relative;overflow:hidden}
  .led-rolling{letter-spacing:2px}
  .led-up{
    color:#00ff88!important;
    animation:creditUp 0.3s ease-out;
  }
  .led-down{
    color:#ff4444!important;
    animation:creditDown 0.3s ease-out;
  }
  @keyframes creditUp{
    0%  {transform:translateY(10px);opacity:0.4}
    60% {transform:translateY(-2px);opacity:1}
    100%{transform:translateY(0);opacity:1}
  }
  @keyframes creditDown{
    0%  {transform:translateY(-10px);opacity:0.4}
    60% {transform:translateY(2px);opacity:1}
    100%{transform:translateY(0);opacity:1}
  }
  .led-low{color:#ff8800!important}
  .led-empty{color:#ff3333!important;animation:ledpulse 0.8s ease-in-out infinite}
  @keyframes ledpulse{0%,100%{opacity:1}50%{opacity:0.4}}

  /* Topup & Info buttons */
  .btn-topup{background:#1a3a00;color:#00ff88;border:1px solid #00cc66;border-radius:6px;padding:3px 10px;font-size:10px;cursor:pointer;font-family:monospace;transition:all 0.15s}
  .btn-topup:hover{background:#225500}
  .btn-info-tog{background:#1a1a2e;color:#4488cc;border:1px solid #4488cc44;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;transition:all 0.15s}
  .btn-info-tog:hover{border-color:#4488cc;background:#1a2a4a}

  /* Modal overlay */
  .modal-overlay{position:fixed;inset:0;background:#00000088;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
  .modal-box{background:#0d0d1a;border:2px solid #c8a84b;border-radius:14px;padding:20px;width:100%;max-width:420px;max-height:90vh;overflow-y:auto}
  .modal-info-box{max-width:560px}
  .modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .modal-title{font-size:16px;color:#ffd700;font-weight:700}
  .modal-close{background:none;border:none;color:#aaa;font-size:22px;cursor:pointer;line-height:1;padding:0 4px}
  .modal-close:hover{color:#fff}
  .modal-empty-msg{background:#3a0000;border:1px solid #cc2200;border-radius:8px;padding:10px;font-size:13px;color:#ff8888;text-align:center;margin-bottom:12px}
  .modal-credit-now{font-size:12px;color:#888;margin-bottom:12px;text-align:center}
  .modal-credit-val{color:#ffd700;font-weight:700;font-size:14px}

  /* Topup */
  .topup-label{font-size:11px;color:#888;margin-bottom:6px}
  .topup-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:4px}
  .topup-preset{background:#1a1a2e;color:#aaa;border:1px solid #333;border-radius:8px;padding:8px 4px;font-size:12px;cursor:pointer;font-family:monospace;transition:all 0.15s;text-align:center}
  .topup-preset:hover{border-color:#ffd700;color:#ffd700}
  .topup-preset.topup-selected{border-color:#ffd700;color:#ffd700;background:#2a2000}
  .topup-custom-row{display:flex;align-items:center;gap:6px;background:#111;border:1px solid #444;border-radius:8px;padding:6px 10px}
  .topup-rp{font-size:13px;color:#888}
  .topup-input{flex:1;background:none;border:none;outline:none;color:#ffd700;font-size:15px;font-family:monospace}
  .topup-error{font-size:11px;color:#ff4444;margin-top:6px}
  .topup-info{font-size:11px;color:#888;text-align:center;margin:8px 0 4px;min-height:16px}
  .topup-info strong{color:#00ff88}
  .topup-btn{width:100%;background:#1a3a00;color:#00ff88;border:2px solid #00cc66;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:monospace;margin-top:8px;transition:all 0.15s}
  .topup-btn:hover{background:#225500}

  /* Info modal */
  .info-sections{display:flex;flex-direction:column;gap:14px}
  .info-section{background:#0a0a14;border:1px solid #222;border-radius:8px;padding:12px}
  .info-sec-title{font-size:12px;color:#ffd700;font-weight:700;margin-bottom:8px}
  .info-list{margin:0;padding-left:18px;font-size:12px;color:#aaa;display:flex;flex-direction:column;gap:4px}
  .info-list li{line-height:1.5}
  .info-list strong{color:#ffd700}
  .info-pay-table{display:flex;flex-direction:column;gap:4px}
  .info-pay-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;background:#111}
  .info-pay-sym{font-size:20px;min-width:28px;text-align:center}
  .ibar{background:#fff;color:#000;font-size:9px;font-weight:800;padding:1px 4px;border-radius:2px}
  .i77{color:#ff3300;font-weight:800;font-size:13px}
  .info-pay-name{font-size:11px;color:#888;min-width:60px}
  .info-pay-mult{font-size:12px;color:#4488cc;font-weight:700;min-width:36px}
  .info-pay-win{font-size:11px;color:#666;flex:1}
  .info-pay-result{color:#00ff88;font-weight:700}
  .info-vol-table{display:flex;flex-direction:column;gap:4px}
  .info-vol-row{background:#111;border:1px solid #222;border-radius:6px;padding:8px 10px}
  .info-vol-row.info-vol-active{border-color:#ffd700;background:#1a1500}
  .info-vol-name{font-size:12px;color:#ffd700;font-weight:700;margin-bottom:2px}
  .info-vol-desc{font-size:11px;color:#888;margin-bottom:2px}
  .info-vol-stats{font-size:10px;color:#555}
  .info-vol-row.info-vol-active .info-vol-stats{color:#888}
  :global(body,html){background:#111118!important;margin:0;padding:0;min-height:100vh}
  :global(#app){background:#111118!important;min-height:100vh}
  :global(meta[name=theme-color]){content:#111118}
  .game{max-width:640px;margin:0 auto;padding:0.75rem;font-family:monospace;background:#111118;user-select:none;min-height:100vh}
  .top-bar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:4px;min-width:0}
  .led{background:#1a0000;color:#ff3333;font-size:18px;padding:6px 10px;border-radius:6px;min-width:70px;max-width:140px;width:auto;text-align:center;letter-spacing:1px;font-family:monospace;white-space:nowrap}
  .lbl{font-size:10px;color:#aaa;margin-bottom:2px}
  .title-box{text-align:center;padding-top:4px;display:flex;flex-direction:column;align-items:center;gap:4px}
  .title{font-size:15px;color:#ffd700;font-weight:700;letter-spacing:1px}
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
  .vol-wrap{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:8px}
  .vol-btn{background:#0d0d1a;border:2px solid #333;border-radius:8px;padding:6px 4px;cursor:pointer;transition:all 0.15s;color:white;text-align:center;min-width:0}
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
  .cell-em{font-size:clamp(18px,4vw,42px);line-height:1}
  .cell-77{font-size:clamp(12px,2.5vw,28px);font-weight:800;color:#ff3300;line-height:1}
  .bar-wrap{display:flex;flex-direction:column;align-items:center;width:92%}
  .bar-top,.bar-bot{background:#fff;color:#000;font-size:14px;font-weight:800;width:100%;text-align:center;line-height:1.5;letter-spacing:1px}
  .bar-mid{background:#cc2200;color:#fff;font-size:14px;font-weight:800;width:100%;text-align:center;line-height:1.6}
  .center-panel{grid-column:2/7;grid-row:2/7;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a1628;border-radius:10px;border:2px solid #c8a84b;gap:6px;padding:12px;transition:border-color 0.3s}
  .center-panel.near-miss{border-color:#ff4444;background:#1a0808;animation:nearflash 0.5s ease-in-out 2}
  @keyframes nearflash{0%,100%{background:#0a1628}50%{background:#2a0808}}
  .center-sym-wrap{display:flex;align-items:center;justify-content:center}
  .c-em{font-size:clamp(48px,12vw,100px);line-height:1}
  .c77{font-size:clamp(40px,10vw,80px);font-weight:800;color:#ff3300;line-height:1}
  .center-bar{width:160px}
  .cb-top,.cb-bot{background:#fff;color:#000;font-size:22px;font-weight:800;text-align:center;padding:5px 0;letter-spacing:2px}
  .cb-mid{background:#cc2200;color:#fff;font-size:32px;font-weight:800;text-align:center;padding:8px 0}
  .center-count{font-size:11px;color:#888}
  .center-num{font-size:clamp(36px,8vw,72px);color:#ff3333;line-height:1;font-family:monospace;font-weight:700}
  .center-lbl{font-size:15px;color:#aaa;text-align:center}

  /* Paytable */
  .section-lbl{font-size:10px;color:#aaa;text-align:center;margin-top:10px;margin-bottom:6px}
  /* Sym slider — horizontal scroll 1 row */
  .sym-slider{display:flex;gap:6px;overflow-x:auto;padding:4px 2px 8px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .sym-slider::-webkit-scrollbar{display:none}
  .sym-btn{flex:0 0 64px;background:#0d0d1a;border:2px solid #333;border-radius:8px;padding:6px 4px;cursor:pointer;transition:all 0.15s;color:white;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:64px}
  .sym-btn:hover:not(:disabled){border-color:#ffd700;background:#1a1a00}
  .sym-btn.selected{border-color:#ffd700;background:#2a2000;box-shadow:0 0 10px #ffd70088}
  .sym-btn:disabled{opacity:0.5;cursor:not-allowed}
  .sym-em{font-size:28px;line-height:1}
  .sym-77{font-size:20px;font-weight:800;color:#ff3300;line-height:1}
  .sym-bar{width:48px}
  .sb-top{background:#fff;color:#000;font-size:8px;font-weight:800;text-align:center;padding:2px;letter-spacing:1px;border-radius:3px 3px 0 0}
  .sb-mid{background:#cc2200;color:#fff;font-size:9px;font-weight:800;text-align:center;padding:2px;border-radius:0 0 3px 3px}
  .sym-pay{font-size:12px;color:#ffd700;font-weight:700;line-height:1}
  .sym-hit{font-size:9px;color:#888;line-height:1}

  /* Info Panel collapsible */
  .info-panel{background:#0d0d1a;border:2px solid #c8a84b44;border-radius:12px;margin-top:10px}
  .info-panel[open]{padding-bottom:14px}
  .info-summary{padding:12px 14px;font-size:12px;color:#c8a84b;font-weight:700;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}
  .info-summary::-webkit-details-marker{display:none}
  .info-summary::after{content:'▼';margin-left:auto;font-size:10px;color:#555}
  .info-panel[open] .info-summary::after{content:'▲'}
  .info-content{padding:0 14px}
  .sim-summary{font-size:13px;color:#4488cc;font-weight:700;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;padding:4px 0 10px}
  .sim-summary::-webkit-details-marker{display:none}
  .sim-summary::after{content:'▼';margin-left:auto;font-size:10px;color:#555}
  .sim-panel[open] .sim-summary::after{content:'▲'}

  /* Info Panel */
  .info-title{font-size:12px;color:#c8a84b;font-weight:700;margin-bottom:10px;letter-spacing:1px}
  .info-content{display:flex;flex-direction:column;gap:10px}
  .info-formula{display:flex;align-items:center;justify-content:center;gap:12px;background:#111;border-radius:8px;padding:12px}
  .info-bet{font-size:24px;color:#ffd700;font-weight:700;font-family:monospace}
  .info-op{font-size:20px;color:#555;font-weight:700}
  .info-pay{font-size:24px;color:#4488cc;font-weight:700;font-family:monospace}
  .info-result{font-size:28px;color:#00ff88;font-weight:700;font-family:monospace}
  .info-desc{font-size:13px;color:#aaa;text-align:center;line-height:1.6}
  .info-win-amount{color:#00ff88;font-size:15px}
  .info-stats{display:flex;align-items:center;gap:0;background:#111;border-radius:8px;overflow:hidden}
  .info-stat{flex:1;text-align:center;padding:10px 6px}
  .info-stat-div{width:1px;background:#222;align-self:stretch}
  .info-stat-label{font-size:9px;color:#666;margin-bottom:4px}
  .info-stat-val{font-size:16px;color:#ffd700;font-weight:700;font-family:monospace}
  .info-stat-val.win-val{color:#00ff88}
  .info-stat-val.loss-val{color:#ff4444}
  .info-stat-sub{font-size:9px;color:#555;margin-top:2px}
  .info-note{font-size:11px;color:#666;text-align:center;padding:6px;background:#111;border-radius:6px}
  .info-note strong{color:#aaa}

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

  /* Stop Loss & Win Limit */
  .limit-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
  .limit-box{background:#0a0a14;border:1px solid #222;border-radius:8px;padding:10px}
  .limit-box.limit-active{border-color:#444}
  .limit-header{display:flex;flex-direction:column;gap:3px;margin-bottom:0}
  .limit-toggle{display:flex;align-items:center;gap:6px;cursor:pointer}
  .limit-toggle input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#ffd700}
  .limit-title{font-size:12px;font-weight:700}
  .loss-title{color:#ff4444}
  .win-title{color:#00ff88}
  .limit-desc{font-size:10px;color:#555;padding-left:20px}
  .limit-control{margin-top:8px}
  .limit-range{width:100%;accent-color:#ffd700}
  .loss-range{accent-color:#ff4444}
  .win-range{accent-color:#00ff88}
  .limit-val-row{display:flex;justify-content:space-between;align-items:center;margin-top:4px}
  .limit-val{font-size:14px;font-weight:700;font-family:monospace}
  .loss-val{color:#ff4444}
  .win-val{color:#00ff88}
  .limit-calc{font-size:10px;color:#666}
  .auto-status-wrap{display:flex;flex-direction:column;gap:4px;align-items:center}
  .auto-limit-status{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
  .ls-badge{font-size:10px;color:#ff4444;background:#3a000033;padding:2px 8px;border-radius:4px;border:1px solid #ff444433}
  .wl-badge{font-size:10px;color:#00ff88;background:#003a1a33;padding:2px 8px;border-radius:4px;border:1px solid #00ff8833}

  /* Controls */
  .controls{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:8px}
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
  .sim-panel{background:#0d0d1a;border:2px solid #4488cc;border-radius:12px;padding:12px 16px;margin-top:10px}
  .sim-title{font-size:14px;color:#4488cc;font-weight:700;margin-bottom:10px}
  .sim-form{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:10px}
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
  .history-list{display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto}
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

  /* LED states */
  .led-credit{transition:color 0.2s;position:relative;overflow:hidden}
  .led-rolling{letter-spacing:2px}
  .led-up{
    color:#00ff88!important;
    animation:creditUp 0.3s ease-out;
  }
  .led-down{
    color:#ff4444!important;
    animation:creditDown 0.3s ease-out;
  }
  @keyframes creditUp{
    0%  {transform:translateY(10px);opacity:0.4}
    60% {transform:translateY(-2px);opacity:1}
    100%{transform:translateY(0);opacity:1}
  }
  @keyframes creditDown{
    0%  {transform:translateY(-10px);opacity:0.4}
    60% {transform:translateY(2px);opacity:1}
    100%{transform:translateY(0);opacity:1}
  }
  .led-low{color:#ff8800!important}
  .led-empty{color:#ff3333!important;animation:ledpulse 0.8s ease-in-out infinite}
  @keyframes ledpulse{0%,100%{opacity:1}50%{opacity:0.4}}

  /* Topup & Info buttons */
  .btn-topup{background:#1a3a00;color:#00ff88;border:1px solid #00cc66;border-radius:6px;padding:3px 10px;font-size:10px;cursor:pointer;font-family:monospace;transition:all 0.15s}
  .btn-topup:hover{background:#225500}
  .btn-info-tog{background:#1a1a2e;color:#4488cc;border:1px solid #4488cc44;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;transition:all 0.15s}
  .btn-info-tog:hover{border-color:#4488cc;background:#1a2a4a}

  /* Modal overlay */
  .modal-overlay{position:fixed;inset:0;background:#00000088;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
  .modal-box{background:#0d0d1a;border:2px solid #c8a84b;border-radius:14px;padding:20px;width:100%;max-width:420px;max-height:90vh;overflow-y:auto}
  .modal-info-box{max-width:560px}
  .modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .modal-title{font-size:16px;color:#ffd700;font-weight:700}
  .modal-close{background:none;border:none;color:#aaa;font-size:22px;cursor:pointer;line-height:1;padding:0 4px}
  .modal-close:hover{color:#fff}
  .modal-empty-msg{background:#3a0000;border:1px solid #cc2200;border-radius:8px;padding:10px;font-size:13px;color:#ff8888;text-align:center;margin-bottom:12px}
  .modal-credit-now{font-size:12px;color:#888;margin-bottom:12px;text-align:center}
  .modal-credit-val{color:#ffd700;font-weight:700;font-size:14px}

  /* Topup */
  .topup-label{font-size:11px;color:#888;margin-bottom:6px}
  .topup-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:4px}
  .topup-preset{background:#1a1a2e;color:#aaa;border:1px solid #333;border-radius:8px;padding:8px 4px;font-size:12px;cursor:pointer;font-family:monospace;transition:all 0.15s;text-align:center}
  .topup-preset:hover{border-color:#ffd700;color:#ffd700}
  .topup-preset.topup-selected{border-color:#ffd700;color:#ffd700;background:#2a2000}
  .topup-custom-row{display:flex;align-items:center;gap:6px;background:#111;border:1px solid #444;border-radius:8px;padding:6px 10px}
  .topup-rp{font-size:13px;color:#888}
  .topup-input{flex:1;background:none;border:none;outline:none;color:#ffd700;font-size:15px;font-family:monospace}
  .topup-error{font-size:11px;color:#ff4444;margin-top:6px}
  .topup-info{font-size:11px;color:#888;text-align:center;margin:8px 0 4px;min-height:16px}
  .topup-info strong{color:#00ff88}
  .topup-btn{width:100%;background:#1a3a00;color:#00ff88;border:2px solid #00cc66;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:monospace;margin-top:8px;transition:all 0.15s}
  .topup-btn:hover{background:#225500}

  /* Info modal */
  .info-sections{display:flex;flex-direction:column;gap:14px}
  .info-section{background:#0a0a14;border:1px solid #222;border-radius:8px;padding:12px}
  .info-sec-title{font-size:12px;color:#ffd700;font-weight:700;margin-bottom:8px}
  .info-list{margin:0;padding-left:18px;font-size:12px;color:#aaa;display:flex;flex-direction:column;gap:4px}
  .info-list li{line-height:1.5}
  .info-list strong{color:#ffd700}
  .info-pay-table{display:flex;flex-direction:column;gap:4px}
  .info-pay-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;background:#111}
  .info-pay-sym{font-size:20px;min-width:28px;text-align:center}
  .ibar{background:#fff;color:#000;font-size:9px;font-weight:800;padding:1px 4px;border-radius:2px}
  .i77{color:#ff3300;font-weight:800;font-size:13px}
  .info-pay-name{font-size:11px;color:#888;min-width:60px}
  .info-pay-mult{font-size:12px;color:#4488cc;font-weight:700;min-width:36px}
  .info-pay-win{font-size:11px;color:#666;flex:1}
  .info-pay-result{color:#00ff88;font-weight:700}
  .info-vol-table{display:flex;flex-direction:column;gap:4px}
  .info-vol-row{background:#111;border:1px solid #222;border-radius:6px;padding:8px 10px}
  .info-vol-row.info-vol-active{border-color:#ffd700;background:#1a1500}
  .info-vol-name{font-size:12px;color:#ffd700;font-weight:700;margin-bottom:2px}
  .info-vol-desc{font-size:11px;color:#888;margin-bottom:2px}
  .info-vol-stats{font-size:10px;color:#555}
  .info-vol-row.info-vol-active .info-vol-stats{color:#888}
</style>
