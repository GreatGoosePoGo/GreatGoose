/** CPython-compatible MT19937 for integer seeds, random(), and choice().
 * Integer seeds are split into little-endian 32-bit limbs, as in CPython's
 * _random.Random.seed. Choice uses getrandbits with rejection, not random().
 */
export class PythonRandom {
    state = new Uint32Array(624);
    index = 624;
    constructor(seed = 0) {
        if (typeof seed === 'number' && !Number.isSafeInteger(seed))
            throw new Error('Pass large integer seeds as a decimal string.');
        let value = BigInt(seed);
        if (value < 0n)
            value = -value;
        const limbs = [];
        do {
            limbs.push(Number(value & 0xffffffffn));
            value >>= 32n;
        } while (value);
        this.state[0] = 19650218;
        for (let i = 1; i < 624; i++)
            this.state[i] = (Math.imul(1812433253, this.state[i - 1] ^ (this.state[i - 1] >>> 30)) + i) >>> 0;
        let i = 1, j = 0;
        for (let k = Math.max(624, limbs.length); k; k--) {
            this.state[i] = ((this.state[i] ^ Math.imul(this.state[i - 1] ^ (this.state[i - 1] >>> 30), 1664525)) + limbs[j] + j) >>> 0;
            i++;
            j++;
            if (i >= 624) {
                this.state[0] = this.state[623];
                i = 1;
            }
            if (j >= limbs.length)
                j = 0;
        }
        for (let k = 623; k; k--) {
            this.state[i] = ((this.state[i] ^ Math.imul(this.state[i - 1] ^ (this.state[i - 1] >>> 30), 1566083941)) - i) >>> 0;
            i++;
            if (i >= 624) {
                this.state[0] = this.state[623];
                i = 1;
            }
        }
        this.state[0] = 0x80000000;
    }
    uint32() {
        if (this.index >= 624) {
            for (let i = 0; i < 624; i++) {
                const y = (this.state[i] & 0x80000000) | (this.state[(i + 1) % 624] & 0x7fffffff);
                this.state[i] = this.state[(i + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
            }
            this.index = 0;
        }
        let y = this.state[this.index++];
        y ^= y >>> 11;
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= y >>> 18;
        return y >>> 0;
    }
    random() { return ((this.uint32() >>> 5) * 67108864 + (this.uint32() >>> 6)) / 9007199254740992; }
    getrandbits(bits) {
        if (!Number.isInteger(bits) || bits < 0 || bits > 32)
            throw new Error('getrandbits supports 0–32 bits.');
        return bits === 0 ? 0 : this.uint32() >>> (32 - bits);
    }
    choice(items) {
        if (!items.length)
            throw new Error('Cannot choose from an empty sequence.');
        const bits = 32 - Math.clz32(items.length);
        let index;
        do {
            index = this.getrandbits(bits);
        } while (index >= items.length);
        return items[index];
    }
}
//# sourceMappingURL=random.js.map