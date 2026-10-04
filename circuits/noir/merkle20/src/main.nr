// Merkle membership in a depth-20 Poseidon tree (about 1M leaves).
// Node hash = Poseidon(left, right), circomlib-compatible BN254 instance.
use poseidon::poseidon::bn254::hash_2;

global DEPTH: u32 = 20;

fn main(root: pub Field, leaf: Field, index: Field, siblings: [Field; DEPTH]) {
    let bits: [u1; DEPTH] = index.to_le_bits();
    let mut cur = leaf;
    for i in 0..DEPTH {
        let s = siblings[i];
        cur = if bits[i] == 1 {
            hash_2([s, cur])
        } else {
            hash_2([cur, s])
        };
    }
    assert(cur == root);
}
