import type { SymDef } from "./types";

export const SYMBOLS: SymDef[] = [
    {
        id: "apple",
        emoji: "🍎",
        boardCount: 3,
        label: "Apel",
        pay: 5,
        weight: 22
    },{
        id: "orange",
        emoji: "🍊",
        boardCount: 3,
        label: "Jeruk",
        pay: 10,
        weight: 18
    },{
        id: "wmelon",
        emoji: "🍉",
        boardCount: 3,
        label: "Semangka",
        pay: 15,
        weight: 14
    },{
        id: "melon",
        emoji: "🍈",
        boardCount: 2,
        label: "Melon",
        pay: 20,
        weight: 12
    },{
        id: "frog",
        emoji: "🐸",
        boardCount: 3,
        label: "Kodok",
        pay: 20,
        weight: 10
    },{
        id: "star",
        emoji: "⭐",
        boardCount: 3,
        label: "Bintang",
        pay: 30,
        weight: 8
    },{
        id: "sev77",
        emoji: "77",
        boardCount: 2,
        label: "77",
        pay: 40,
        weight: 6
    },{
        id: "bar",
        emoji: "BAR",
        boardCount: 3,
        label: "BAR",
        pay: 100,
        weight: 4
    },
]
export const SYMBOL_IDS =
    SYMBOLS.map(s => s.id);

export const SYMBOL_BY_ID =
    Object.fromEntries(
        SYMBOLS.map(s => [s.id, s])
    );

export const WEIGHTS =
    SYMBOLS.map(s => s.weight);