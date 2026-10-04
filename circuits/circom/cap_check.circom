pragma circom 2.1.6;
// Spending-mandate cap check: 16 private 64-bit payments, each <= public
// per-tx cap, and every running total <= public budget.
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

template CapCheck(N) {
    signal input per_tx_cap;
    signal input total_cap;
    signal input amounts[N];

    // 64-bit range checks (mirrors Noir u64 typing)
    component rcPer = Num2Bits(64);  rcPer.in <== per_tx_cap;
    component rcTot = Num2Bits(64);  rcTot.in <== total_cap;
    component rc[N];
    component le[N];
    component leSum[N];
    component rcSum[N];
    signal sum[N + 1];
    sum[0] <== 0;
    for (var i = 0; i < N; i++) {
        rc[i] = Num2Bits(64);
        rc[i].in <== amounts[i];
        le[i] = LessEqThan(64);
        le[i].in[0] <== amounts[i];
        le[i].in[1] <== per_tx_cap;
        le[i].out === 1;
        sum[i + 1] <== sum[i] + amounts[i];
        // u64 overflow check on the running sum
        rcSum[i] = Num2Bits(64);
        rcSum[i].in <== sum[i + 1];
        leSum[i] = LessEqThan(64);
        leSum[i].in[0] <== sum[i + 1];
        leSum[i].in[1] <== total_cap;
        leSum[i].out === 1;
    }
}

component main { public [per_tx_cap, total_cap] } = CapCheck(16);
