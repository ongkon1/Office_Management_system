/** Calendar attribution is explicit; the host machine's timezone is irrelevant. */
export function localParts(instant: string, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const get = (key: string) => parts.find((part) => part.type === key)!.value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, clock: `${get('hour')}:${get('minute')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
/** Refuse nonexistent or ambiguous wall times rather than guessing a DST offset. */
export function clockInstant(date: string, clock: string, timezone: string): string | null {
    const wall = Date.parse(`${date}T${clock.padStart(5, '0')}:00Z`);
    if (!Number.isFinite(wall))
        return null;
    const offsets = new Set<number>();
    for (const delta of [-36, -12, 0, 12, 36]) {
        const sample = wall + delta * 3600000;
        const parts = localParts(new Date(sample).toISOString(), timezone);
        offsets.add(Date.parse(`${parts.date}T${parts.clock}:00Z`) - sample);
    }
    const candidates = [...offsets].map((offset) => new Date(wall - offset).toISOString()).filter((instant) => {
        const parts = localParts(instant, timezone);
        return parts.date === date && parts.clock === clock.padStart(5, '0');
    });
    return candidates.length === 1 ? candidates[0] : null;
}
/** Timer policy: attribute elapsed time to its local start date; never wrap clocks. */
export function elapsedMinutes(start: string, end: string): number {
    const milliseconds = Date.parse(end) - Date.parse(start);
    if (!Number.isFinite(milliseconds) || milliseconds < 0)
        throw new Error('Invalid timer range');
    return Math.floor(milliseconds / 60000);
}
