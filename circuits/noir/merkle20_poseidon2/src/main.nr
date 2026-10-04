// Idiomatic-Noir variant of merkle20 using Poseidon2 node hashing.
// The root is returned as a public output.
use poseidon::poseidon2::Poseidon2;

global DEPTH: u32 = 20;

fn main(leaf: Field, index: Field, siblings: [Field; DEPTH]) -> pub Field {
    let bits: [u1; DEPTH] = index.to_le_bits();
    let mut cur = leaf;
    for i in 0..DEPTH {
        let s = siblings[i];
        cur = if bits[i] == 1 { Poseidon2::hash([s, cur], 2) } else { Poseidon2::hash([cur, s], 2) };
    }
    cur
}
