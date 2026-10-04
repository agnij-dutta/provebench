// Poseidon hash chain, N = 100.
// h_0 = seed, h_{i+1} = Poseidon(h_i, i). Proves knowledge of a seed whose
// 100-step chain ends at the public `expected` value.
// Poseidon here is the circomlib-compatible BN254 instance (t = 3).
use poseidon::poseidon::bn254::hash_2;

global N: u32 = 100;

fn main(seed: Field, expected: pub Field) {
    let mut h = seed;
    for i in 0..N {
        h = hash_2([h, i as Field]);
    }
    assert(h == expected);
}
