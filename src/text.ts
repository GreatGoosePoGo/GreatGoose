/** Replay text utilities. Legacy Python literals are parsed as data, never eval'd. */
class Match extends Array<string | undefined> {
    constructor(private result: RegExpExecArray) { super(...result); }
    group(name: string | number = 0): string | undefined { return typeof name === 'number' ? this.result[name] : this.result.groups?.[name]; }
}
function regex(pattern: string, flags = '', full = false): RegExp {
    const source = pattern.replace(/\(\?P</g, '(?<');
    return new RegExp(full ? '^(?:' + source + ')$' : source, flags);
}
export const re = {
    I: 'i',
    compile(pattern: string, flags = '') { return { fullmatch(text: string) { const m = regex(pattern, flags, true).exec(text); return m ? new Match(m) : null; } }; },
    fullmatch(pattern: string, text: string, flags = '') { return this.compile(pattern, flags).fullmatch(text); },
    findall(pattern: string, text: string): string[] { return Array.from(text.matchAll(regex(pattern, 'g')), m => m[0]); },
};
export function seconds_to_tick(value: string, line_number: number): number {
    const fail = (message: string): never => { throw new Error(`Line ${line_number}: ${message}`); };
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match)
        return fail(`Invalid time "${value}".`);
    const fraction = (match[3] ?? '').replace(/0+$/, '');
    if (fraction !== '' && fraction !== '5')
        return fail('Times must use whole or half seconds because one game tick is 0.5s.');
    const tick = BigInt(match[2]) * 2n + (fraction === '5' ? 1n : 0n);
    if (match[1] === '-' && tick > 0n)
        return fail('Times cannot be negative.');
    if (tick > BigInt(Number.MAX_SAFE_INTEGER))
        return fail('Time is too large to represent as an exact game tick.');
    return Number(tick);
}
export function literal(text: string): any {
    if (text.length > 2000000)
        throw new Error('Literal is too large.');
    let pos = 0;
    const ws = () => { while (/\s/.test(text[pos] ?? '') && pos < text.length)
        pos++; };
    function value(depth = 0): any {
        if (depth > 64)
            throw new Error('Literal nesting is too deep.');
        ws();
        const c = text[pos];
        if (c === '[' || c === '(') {
            pos++;
            const close = c === '[' ? ']' : ')';
            const result: any[] = [];
            ws();
            while (text[pos] !== close) {
                result.push(value(depth + 1));
                ws();
                if (text[pos] === close)
                    break;
                if (text[pos++] !== ',')
                    throw new Error('Expected comma.');
                ws();
            }
            if (text[pos++] !== close)
                throw new Error('Unclosed list.');
            return result;
        }
        if (c === '"' || c === "'") {
            pos++;
            let result = '';
            while (pos < text.length) {
                let ch = text[pos++];
                if (ch === c)
                    return result;
                if (ch === '\\') {
                    ch = text[pos++];
                    const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', '\\': '\\', "'": "'", '"': '"' };
                    if (Object.hasOwn(escapes, ch))
                        ch = escapes[ch];
                    else if (ch === 'u' || ch === 'U' || ch === 'x') {
                        const count = ch === 'u' ? 4 : ch === 'U' ? 8 : 2, hex = text.slice(pos, pos + count);
                        if (!new RegExp('^[a-fA-F0-9]{' + count + '}$').test(hex))
                            throw new Error('Invalid character escape.');
                        ch = String.fromCodePoint(parseInt(hex, 16));
                        pos += count;
                    }
                    else
                        ch = '\\' + ch;
                }
                result += ch;
            }
            throw new Error('Unclosed string.');
        }
        for (const [word, result] of [['True', true], ['False', false], ['None', null], ['true', true], ['false', false], ['null', null]] as const) {
            if (text.slice(pos).startsWith(word)) {
                pos += word.length;
                return result;
            }
        }
        const n = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(pos));
        if (n) {
            pos += n[0].length;
            const number = Number(n[0]);
            if (!Number.isFinite(number))
                throw new Error('Non-finite literal.');
            return number;
        }
        throw new Error('Expected a string, number, boolean, or list.');
    }
    const result = value();
    ws();
    if (pos !== text.length)
        throw new Error('Unexpected text after literal.');
    return result;
}
