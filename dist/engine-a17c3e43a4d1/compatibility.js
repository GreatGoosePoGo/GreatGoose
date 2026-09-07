/** Small, explicit semantic helpers retained for Python/TypeScript parity.
 * These operate on native JS objects; there is no interpreter or Python runtime.
 * In particular, empty collections, tuple keys, equality and rounding differ
 * between the languages. Keep those decisions here rather than in battle rules.
 */
export { literal } from './text.js';
export const key = (k) => Array.isArray(k) ? JSON.stringify(k) : String(k);
export const truth = (v) => v == null ? false : typeof v === 'object' ? (v instanceof Set ? v.size > 0 : Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0) : Boolean(v);
export const and = (a, b) => truth(a) ? b() : a;
const orValue = (a, b) => truth(a) ? a : b();
export { orValue as or };
export function equal(a, b) {
    if (a === b)
        return true;
    if (a == null || b == null || typeof a !== typeof b)
        return false;
    if (Array.isArray(a))
        return Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
    if (a instanceof Set)
        return b instanceof Set && a.size === b.size && [...a].every(x => b.has(x));
    if (typeof a === 'object') {
        const ak = Object.keys(a);
        return ak.length === Object.keys(b).length && ak.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
    }
    return false;
}
const numericKey = (s) => /^-?\d+$/.test(s) ? Number(s) : s;
export function iter(v = []) { return v == null ? [] : Array.isArray(v) ? [...v] : typeof v === 'string' || v instanceof Set ? Array.from(v) : Object.keys(v).map(numericKey); }
export const len = (v) => v instanceof Set ? v.size : typeof v === 'string' || Array.isArray(v) ? v.length : Object.keys(v).length;
export const dict = (v = []) => Array.isArray(v) ? Object.assign(Object.create(null), Object.fromEntries(v.map(([k, value]) => [key(k), value]))) : Object.assign(Object.create(null), v);
export function at(v, k) {
    if (v == null)
        throw new Error(`Cannot index ${v}`);
    if (Array.isArray(v) || typeof v === 'string') {
        const i = Number(k);
        if (i < -v.length || i >= v.length)
            throw new Error(`Index ${i} is out of range`);
        return v.at(i);
    }
    if (!Object.hasOwn(v, key(k)))
        throw new Error(`Unknown key ${key(k)}`);
    return v[key(k)];
}
export const put = (v, k, value) => { v[key(k)] = value; };
export const get = (v, k, fallback = null) => Object.hasOwn(v, key(k)) ? v[key(k)] : fallback;
export const has = (v, k) => v instanceof Set ? v.has(k) : typeof v === 'string' ? v.includes(k) : Array.isArray(v) ? v.some(x => equal(x, k)) : Object.hasOwn(v, key(k));
export const keys = (v) => Object.keys(v).map(numericKey);
export const values = (v) => Object.values(v);
export const items = (v) => Object.entries(v).map(([k, value]) => [numericKey(k), value]);
export const set = (v = []) => new Set(iter(v));
export const append = (v, x) => { v.push(x); };
export const extend = (v, x) => { v.push(...iter(x)); };
export const discard = (v, x) => { v.delete(x); };
export function clear(v) {
    if (v instanceof Set)
        v.clear();
    else
        for (const k of Object.keys(v))
            delete v[k];
}
export function pop(v, k, fallback = null) {
    if (Array.isArray(v))
        return k === undefined ? v.pop() : v.splice(k, 1)[0];
    const result = get(v, k, fallback);
    delete v[key(k)];
    return result;
}
export function index(v, x, start = 0) {
    const i = v.findIndex((y, i) => i >= start && equal(x, y));
    if (i < 0)
        throw new Error('Value not found');
    return i;
}
export const update = (v, other) => { Object.assign(v, other); };
export const setdefault = (v, k, d) => Object.hasOwn(v, key(k)) ? v[key(k)] : (v[key(k)] = d);
export const slice = (v, start, end) => v.slice(start, end);
export const range = (a, b, step = 1) => { const start = b === undefined ? 0 : a, stop = b === undefined ? a : b; return Array.from({ length: Math.max(0, Math.ceil((stop - start) / step)) }, (_, i) => start + i * step); };
export const enumerate = (v, start = 0) => iter(v).map((x, i) => [i + start, x]);
export const zip = (...vs) => range(Math.min(...vs.map(len))).map(i => vs.map(v => v[i]));
export const next = (v, fallback = null) => iter(v)[0] ?? fallback;
export const sum = (v) => iter(v).reduce((a, b) => a + Number(b), 0);
export const mean = (v) => sum(v) / len(v);
export function compare(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            const c = compare(a[i], b[i]);
            if (c)
                return c;
        }
        return a.length - b.length;
    }
    return a < b ? -1 : a > b ? 1 : 0;
}
export const sorted = (v, fn = (x) => x, reverse = false) => iter(v).sort((a, b) => compare(fn(a), fn(b)) * (reverse ? -1 : 1));
export const max = (...v) => (v.length === 1 ? iter(v[0]) : v).reduce((a, b) => compare(a, b) >= 0 ? a : b);
export const min = (...v) => (v.length === 1 ? iter(v[0]) : v).reduce((a, b) => compare(a, b) <= 0 ? a : b);
export const round = (v) => { const n = Math.floor(v), f = v - n; return f === 0.5 ? n + (n % 2 === 0 ? 0 : 1) : Math.round(v); };
export const divmod = (a, b) => [Math.floor(a / b), ((a % b) + b) % b];
export const floordiv = (a, b) => Math.floor(a / b);
export const mod = (a, b) => ((a % b) + b) % b;
export const add = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.concat(b) : typeof a === "bigint" || typeof b === "bigint" ? BigInt(a) + BigInt(b) : a + b;
export const sub = (a, b) => a instanceof Set ? new Set([...a].filter(x => !b.has(x))) : a - b;
export const mul = (a, b) => typeof a === 'string' ? a.repeat(b) : Array.isArray(a) ? Array.from({ length: b }, () => a).flat() : a * b;
export function int(v) {
    if (typeof v === "string" && !/^[+-]?\d+$/.test(v.trim()))
        throw new Error(`Invalid integer: ${v}`);
    const n = Number(v);
    if (!Number.isFinite(n))
        throw new Error(`Invalid integer: ${v}`);
    return Math.trunc(n);
}
export function float(v) {
    const n = Number(v);
    if (!Number.isFinite(n))
        throw new Error(`Invalid number: ${v}`);
    return n;
}
export const isInteger = (v) => Number.isInteger(v);
export function isinstance(v, type) { return (type.includes('int') && Number.isInteger(v)) || (type.includes('float') && typeof v === 'number') || (type.includes('bool') && typeof v === 'boolean') || (type.includes('str') && typeof v === 'string') || ((type.includes('tuple') || type.includes('list')) && Array.isArray(v)) || (type === 'dict' && v !== null && typeof v === 'object' && !Array.isArray(v)); }
export const type = (v) => Number.isInteger(v) ? 'int' : typeof v;
export const str = (v) => v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : Array.isArray(v) || (v && typeof v === 'object') ? repr(v) : String(v);
export function repr(v) {
    if (typeof v === 'string') {
        const quote = v.includes("'") && !v.includes('"') ? '"' : "'";
        return quote + v.replaceAll('\\', '\\\\').replaceAll(quote, '\\' + quote).replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t') + quote;
    }
    if (Array.isArray(v))
        return '[' + v.map(repr).join(', ') + ']';
    if (v && typeof v === 'object')
        return '{' + items(v).map(([k, x]) => repr(k) + ': ' + repr(x)).join(', ') + '}';
    return str(v);
}
export function format(v, spec) {
    const m = /^(\d+)?(?:\.(\d+))?([fg%])$/.exec(spec);
    if (!m)
        return String(v);
    const digits = m[2] === undefined ? 6 : Number(m[2]);
    let s = m[3] === 'f' ? Number(v).toFixed(digits) : m[3] === '%' ? (Number(v) * 100).toFixed(digits) + '%' : Number(v).toPrecision(digits).replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.(e|$)/, '$1');
    return s.padStart(Number(m[1] || 0));
}
export const join = (sep, v) => iter(v).join(sep);
const trimRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const strip = (s, chars) => chars === undefined ? s.trim() : s.replace(new RegExp('^[' + trimRE(chars) + ']+|[' + trimRE(chars) + ']+$', 'g'), '');
export const lstrip = (s, chars) => chars === undefined ? s.trimStart() : s.replace(new RegExp('^[' + trimRE(chars) + ']+'), '');
export const rstrip = (s, chars) => chars === undefined ? s.trimEnd() : s.replace(new RegExp('[' + trimRE(chars) + ']+$'), '');
export const lower = (s) => s.toLowerCase();
export const upper = (s) => s.toUpperCase();
export const title = (s) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
export const isalnum = (s) => /^[\p{L}\p{N}]+$/u.test(s);
export const startswith = (s, prefix) => Array.isArray(prefix) ? prefix.some(p => s.startsWith(p)) : s.startsWith(prefix);
export const endswith = (s, suffix) => s.endsWith(suffix);
export const removeprefix = (s, prefix) => s.startsWith(prefix) ? s.slice(prefix.length) : s;
export const replaceString = (s, old, replacement) => s.replaceAll(old, replacement);
export function split(s, sep, maxsplit) {
    if (sep === undefined)
        return s.trim().split(/\s+/);
    const parts = s.split(sep);
    if (maxsplit !== undefined && parts.length > maxsplit)
        return [...parts.slice(0, maxsplit), parts.slice(maxsplit).join(sep)];
    return parts;
}
export const splitlines = (s) => s.split(/\r\n|\n|\r/);
/** Lexicographic binary heap: preserves CPython heapq's event tie order. */
export function heappush(heap, item) {
    let i = heap.length;
    heap.push(item);
    while (i > 0) {
        const p = (i - 1) >>> 1;
        if (compare(item, heap[p]) >= 0)
            break;
        heap[i] = heap[p];
        i = p;
    }
    heap[i] = item;
}
export function heappop(heap) {
    if (!heap.length)
        throw new Error('Empty event queue');
    const first = heap[0], last = heap.pop();
    if (heap.length) {
        let i = 0;
        while (2 * i + 1 < heap.length) {
            let c = 2 * i + 1;
            if (c + 1 < heap.length && compare(heap[c + 1], heap[c]) < 0)
                c++;
            if (compare(last, heap[c]) <= 0)
                break;
            heap[i] = heap[c];
            i = c;
        }
        heap[i] = last;
    }
    return first;
}
/** JSON-safe integer seed; preserve all bits beyond JS's safe integer range. */
export function parseSeed(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value))
        throw new Error('Pass large integer seeds as decimal strings.');
    if (!/^[+-]?\d+$/.test(String(value)))
        throw new Error('Seed must be a whole number.');
    const seed = BigInt(value);
    if (seed.toString().length > 1000)
        throw new Error('Seed is too large.');
    return seed >= BigInt(Number.MIN_SAFE_INTEGER) && seed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(seed) : seed.toString();
}
//# sourceMappingURL=compatibility.js.map