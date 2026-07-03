export function random(): number {
    return Math.random();
}

export function randomInt(min: number, max: number): number {
    return Math.floor(random() * (max - min + 1)) + min;
}

export function chance(percent: number): boolean {
    return random() < percent;
}

export function pick<T>(items: T[]): T {
    return items[randomInt(0, items.length - 1)];
}

export function weightedIndex(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);

    let roll = random() * total;

    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];

        if (roll <= 0) {
            return i;
        }
    }

    return weights.length - 1;
}

export function shuffle<T>(array: T[]): T[] {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = randomInt(0, i);

        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}