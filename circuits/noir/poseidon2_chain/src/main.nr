// Idiomatic-Noir variant of poseidon_chain: same 100-step chain shape, but
// using Poseidon2, which Barretenberg proves with a native gate. NOT the same
// hash as the circomlib Poseidon used in poseidon_chain, so it is reported as
// a variant, not as a like-for-like comparison. The final hash is returned as
// a public output.
use poseidon::poseidon2::Poseidon2;

global N: u32 = 100;

fn main(seed: Field) -> pub Field {
    let mut h = seed;
    for i in 0..N {
        h = Poseidon2::hash([h, i as Field], 2);
    }
    h
}
