pragma circom 2.1.6;
// Merkle membership, depth 20, node = Poseidon(left, right).
include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

template Merkle(DEPTH) {
    signal input root;
    signal input leaf;
    signal input index;
    signal input siblings[DEPTH];

    component bits = Num2Bits(DEPTH);
    bits.in <== index;

    signal cur[DEPTH + 1];
    signal left[DEPTH];
    signal right[DEPTH];
    component h[DEPTH];
    cur[0] <== leaf;
    for (var i = 0; i < DEPTH; i++) {
        // bit = 0: (cur, sib); bit = 1: (sib, cur)
        left[i] <== cur[i] + bits.out[i] * (siblings[i] - cur[i]);
        right[i] <== siblings[i] + cur[i] - left[i];
        h[i] = Poseidon(2);
        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== right[i];
        cur[i + 1] <== h[i].out;
    }
    cur[DEPTH] === root;
}

component main { public [root] } = Merkle(20);
