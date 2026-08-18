/**
 * Deterministic, non-negative integer node ids for HydraDB (node ids must be
 * non-negative integers). Ids derive from a stable canonical key via FNV-1a
 * (32-bit), so the same entity always maps to the same id -> idempotent MERGE
 * (RISK-010). A registry detects the (astronomically unlikely) hash collision
 * between two distinct keys rather than silently merging them.
 */

/** FNV-1a 32-bit hash of a UTF-8 string, returned as an unsigned integer. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i) & 0xff;
    // hash *= 16777619, kept in 32-bit space
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Hex digest of FNV-1a 32-bit (used for stable request ids). */
export function fnv1a32Hex(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, "0");
}

export class NodeIdRegistry {
  private readonly byKey = new Map<string, number>();
  private readonly byId = new Map<number, string>();

  /** Return the stable id for a key, allocating (and collision-checking) on first use. */
  idFor(key: string): number {
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;

    const id = fnv1a32(key);
    const owner = this.byId.get(id);
    if (owner !== undefined && owner !== key) {
      throw new Error(`Node id collision: keys "${owner}" and "${key}" both hash to ${id}`);
    }
    this.byKey.set(key, id);
    this.byId.set(id, key);
    return id;
  }
}
