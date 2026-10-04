**What this changes**

**Type**
- [ ] Result submission (`results/browser/*.json` or `results/<machine>.json`)
- [ ] New workload or proving system
- [ ] Runner, web app or docs

**Checklist**
- [ ] `npm run lint` and `npm run format:check` pass
- [ ] Circuits changed: `npm run build:noir` re-run, `nargo fmt --check` passes, artifacts committed
- [ ] Results: the file states machine, date, reps and what else was running (load average or a note)
- [ ] New workload or system: equivalence explained (same statement, public/private split and inputs)
