export type SymDef = {
    id: string
    emoji: string
    boardCount: number
    label: string
    pay: number
    weight: number
}

export type VolTier = {
    id: string
    label: string
    desc: string
    hitRate: number
    maxWinMult: number
    rtp: number
}

export type Cell = {
    r: number
    c: number
}

export type HistoryEntry = {
    round: number
    result: "WIN" | "LOSE" | "NEAR"
    sym: string
    emoji: string
    bet: number
    win: number
    credit: number
    vol: string
}