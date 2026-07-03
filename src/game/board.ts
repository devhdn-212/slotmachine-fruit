import { CONFIG } from "./config";
import { SYMBOLS } from "./symbols";
import type { SymDef } from "./types";

export type Board = SymDef[][];

export function makeBoard(): Board {
    const board: Board = [];

    const pool: SymDef[] = [];

    for (const symbol of SYMBOLS) {
        for (let i = 0; i < symbol.boardCount; i++) {
            pool.push(symbol);
        }
    }

    for (let row = 0; row < CONFIG.ROWS; row++) {
        const line: SymDef[] = [];

        for (let col = 0; col < CONFIG.COLS; col++) {
            line.push(pool[(row * CONFIG.COLS + col) % pool.length]);
        }

        board.push(line);
    }

    return shuffleBoard(board);
}

export function shuffleBoard(board: Board): Board {
    const flat = board.flat();

    for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [flat[i], flat[j]] = [flat[j], flat[i]];
    }

    const result: Board = [];

    let index = 0;

    for (let r = 0; r < CONFIG.ROWS; r++) {
        const row: SymDef[] = [];

        for (let c = 0; c < CONFIG.COLS; c++) {
            row.push(flat[index++]);
        }

        result.push(row);
    }

    return result;
}

export function countSymbol(board: Board, id: string): number {
    let total = 0;

    for (const row of board) {
        for (const cell of row) {
            if (cell.id === id) {
                total++;
            }
        }
    }

    return total;
}

export function findSymbolPositions(board: Board, id: string) {
    const positions: { r: number; c: number }[] = [];

    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            if (board[r][c].id === id) {
                positions.push({ r, c });
            }
        }
    }

    return positions;
}

export function flattenBoard(board: Board): SymDef[] {
    return board.flat();
}

export function getBorder(board: Board): SymDef[] {
    const result: SymDef[] = [];

    const rows = CONFIG.ROWS;
    const cols = CONFIG.COLS;

    for (let c = 0; c < cols; c++) {
        result.push(board[0][c]);
    }

    for (let r = 1; r < rows - 1; r++) {
        result.push(board[r][cols - 1]);
    }

    for (let c = cols - 1; c >= 0; c--) {
        result.push(board[rows - 1][c]);
    }

    for (let r = rows - 2; r >= 1; r--) {
        result.push(board[r][0]);
    }

    return result;
}