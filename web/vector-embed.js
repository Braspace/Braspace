// Deterministic 384-dimensional lexical projection (braspace-lexical-384-v1)
// matching api/vector_embed.go bit-for-bit. Used ONLY for provenance-linked
// metadata retrieval via POST /api/vector/search; NEVER for lunar physics.
export const VECTOR_MODEL_ID = "braspace-lexical-384-v1";
export const VECTOR_DIMENSIONS = 384;
const encoder = new TextEncoder();
function fnv1a32(bytes) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}
function normalizeLexicalBytes(text) {
    const raw = encoder.encode(String(text || ""));
    const out = [];
    let lastSpace = true;
    for (let i = 0; i < raw.length; i++) {
        let b = raw[i];
        if (b >= 65 && b <= 90)
            b += 32;
        if ((b >= 97 && b <= 122) || (b >= 48 && b <= 57)) {
            out.push(b);
            lastSpace = false;
        }
        else if (!lastSpace) {
            out.push(32);
            lastSpace = true;
        }
    }
    if (out.length > 0 && out[out.length - 1] === 32)
        out.pop();
    return new Uint8Array(out);
}
export function embedProvenanceText(text) {
    const normBytes = normalizeLexicalBytes(text);
    if (normBytes.length === 0) {
        throw new Error("query text must contain alphanumeric characters");
    }
    const vec = new Array(VECTOR_DIMENSIONS).fill(0);
    const addFeature = (featBytes, weight) => {
        const h = fnv1a32(featBytes);
        const idx = h % VECTOR_DIMENSIONS;
        vec[idx] += ((h >>> 31) & 1) === 1 ? -weight : weight;
    };
    const normStr = String.fromCharCode(...normBytes);
    for (const tok of normStr.split(" ")) {
        if (tok.length >= 2) {
            addFeature(encoder.encode("t:" + tok), 2.0);
        }
    }
    if (normBytes.length >= 3) {
        for (let i = 0; i <= normBytes.length - 3; i++) {
            addFeature(normBytes.subarray(i, i + 3), 1.0);
        }
    }
    else {
        addFeature(normBytes, 1.0);
    }
    let sumSq = 0;
    for (let i = 0; i < vec.length; i++)
        sumSq += vec[i] * vec[i];
    if (!Number.isFinite(sumSq) || sumSq <= 0) {
        throw new Error("embedding norm must be positive");
    }
    const inv = 1 / Math.sqrt(sumSq);
    for (let i = 0; i < vec.length; i++)
        vec[i] *= inv;
    return vec;
}
