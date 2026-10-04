pragma circom 2.1.6;
// Poseidon hash chain, N = 100. h_0 = seed, h_{i+1} = Poseidon(h_i, i).
include "../../node_modules/circomlib/circuits/poseidon.circom";

template PoseidonChain(N) {
    signal input seed;
    signal input expected;
    signal h[N + 1];
    component p[N];
    h[0] <== seed;
    for (var i = 0; i < N; i++) {
        p[i] = Poseidon(2);
        p[i].inputs[0] <== h[i];
        p[i].inputs[1] <== i;
        h[i + 1] <== p[i].out;
    }
    h[N] === expected;
}

component main { public [expected] } = PoseidonChain(100);
