// Spending-mandate cap check: an agent proves that a private batch of 16
// payments respects a public per-transaction cap AND that the running total
// never exceeds a public budget, without revealing the individual amounts.
// All values are 64-bit. Every prefix sum is checked against the budget.
global N: u32 = 16;

fn main(per_tx_cap: pub u64, total_cap: pub u64, amounts: [u64; N]) {
    let mut sum: u64 = 0;
    for i in 0..N {
        let a = amounts[i];
        assert(a <= per_tx_cap);
        sum = sum + a;
        assert(sum <= total_cap);
    }
}
