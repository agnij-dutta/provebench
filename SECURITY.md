# Security

ProveBench measures proving performance. It is not a library for producing proofs that anyone should rely on.

## Reporting

Use GitHub private vulnerability reporting on https://github.com/agnij-dutta/provebench (Security tab, "Report a vulnerability"). Please do not open a public issue for a security problem.

## In scope

- A circuit that accepts inputs it should reject, so a benchmarked statement is weaker than the README claims (this would make the comparison unfair, not just wrong).
- The browser suite executing or fetching anything other than the bundled circuits, inputs and keys, or sending data off the device.
- Supply chain problems in the build scripts (downloaded binaries, ptau files) such as missing integrity checks that could be exploited.

## Not in scope, by design

- **Groth16 trusted setup.** The zkeys use a bare phase 2 with no contribution on top of the PSE perpetual powers of tau. Anyone can forge proofs for these circuits. This is deliberate: proving cost is identical, and the keys exist only to time proving.
- **Soundness of the underlying proving systems** (Barretenberg, snarkjs, rapidsnark, circom). Report those upstream.
- **Result submissions.** Results are self-reported JSON files reviewed in PRs. Nothing stops someone from submitting a fake number other than review.
