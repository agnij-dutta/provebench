# Raw runner logs

- `2026-10-04-run1-superseded.log`: first full native run (host 1-minute load 10 to 27). Superseded because the SHA-256 Groth16 zkey used in it was missing its trailing contributions section (the setup process had died while writing it): snarkjs could still prove with it, rapidsnark refused. The key was regenerated and the whole suite re-run. Kept because it shows how much host load moves the numbers (for example merkle20 / bb prove: 2.24 s here vs 1.02 s in run 2).
- `2026-10-04-run2.log`: the run behind `../archive/2026-10-04-loaded/macbook-air-m4-16gb.json` (host 1-minute load about 9 to 11).
- `2026-10-04-run3.log`: the run behind `../macbook-air-m4-16gb.json` (7 reps, 15 s cooldown between cells, host CPU busy 13 to 31% before each cell). Run 2 and its results now live in `../archive/2026-10-04-loaded/`; run 2 was taken at 1-minute load about 9 to 11 and most cells were about 2x slower than in run 3.
