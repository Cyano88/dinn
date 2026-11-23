# Dinn

Dinn helps people launch tokens on Pons and use wallet tools through a guided chat. Dinn Labs gives autonomous trading agents sourced, read-only research about Robinhood stock tokens and Pons launches on Robinhood Chain, Coinbase tokenized stocks on Base, and Bankr stock-paired launches. The paid research service is [live on NEAR AI Agent Market](https://market.near.ai/a/dinn).

**Open Dinn:** [dinnlabs.com](https://dinnlabs.com) &middot; [Using Dinn Chat](https://dinnlabs.com/docs) &middot; [Developer docs](https://dinnlabs.com/docs/integrate) &middot; [Marketplace integration record](docs/NEAR-MARKETPLACE.md)

## The agent service

Send the chain and target in the first message.

- **Robinhood Chain.** For a Robinhood stock token, send its ticker or contract address to check its identity and available reference price. For a Pons launch, send its contract address to check its bonding curve, volume, fees and sampled holder activity. Request stock-paired launch research to see the launch and its pairing stock separately. Reports check supported PinkLock, UNCX V2, HoodLock and Titan records for the exact token.
- **Base.** For a Coinbase stock token, send its ticker or Base address to check its identity, dated reference value, transfer controls and available market and holder evidence. For a stock-paired Bankr launch, send the launch address to verify the pair and check available pool activity, fees and vesting.

Reports include sources and coverage limits. An empty locker search covers only the sources checked. The buyer retains control of trading decisions.

The public JSON endpoint is a free, read-only preview. The separate NEAR Agent Market listing hires Dinn's self-hosted worker for **$0.10 per report**. The worker polls for funded assignments, delivers the report, and persists job recovery state in PostgreSQL. NEAR Agent Market handles the hire and payment; Pons and Robinhood Chain supply token evidence. 0G powers Dinn's conversational inference, while the on-chain report is deterministic.

## Reproduce the flow

Use Node 22 or newer. No wallet key is needed for the read-only path.

```sh
npm ci
npm test
npm start
```

Open `http://127.0.0.1:4317`. Provider-backed reads need the relevant RPC configuration in a local `.env` copied from `.env.example`. Never commit credentials. To try the hosted public API, inspect [`/.well-known/dinn.json`](https://dinn-pasy.onrender.com/.well-known/dinn.json), then send this request to `https://dinn-pasy.onrender.com/api/agent/request`:

```json
{"service":"token.research","requestId":"judge-grail-1","input":{"address":"0x43468fc21c46d30cf765e1a1d0ed32ecb6bd89a4"}}
```

**See:** `status: completed`, a checked Robinhood Chain block, `deliverableMarkdown`, machine-readable evidence, an `evidence.sha256` content hash, and `broadcast: false`. Results change with the chain and source coverage. A hash checks content integrity; it is not an attestation or payment receipt. The [reference trading-agent client](scripts/dinn-trading-agent-demo.mjs) checks the hash and token/block binding, recomputes sampled holder flows, and returns a conservative `REVIEW`, `ABSTAIN`, or simulation-only outcome. Run it with:

```sh
node scripts/dinn-trading-agent-demo.mjs 0x43468fc21c46d30cf765e1a1d0ed32ecb6bd89a4
```

The [marketplace record](docs/NEAR-MARKETPLACE.md) documents a controlled $0.10 hire: Dinn delivered a report in 11 seconds, the buyer accepted it, and the marketplace recorded payment released. The buyer and seller accounts belonged to the same owner. This verifies the paid delivery path, not independent customer demand or an external-wallet withdrawal. A zero-cost Agent Market test run for normal Coinbase stock research was also picked up and delivered automatically; it returned dated NVDAc market evidence and the optional Bankr handoff. Holder data was intentionally omitted, no payment was due, and buyer acceptance remains pending. The run did not place a trade.

## Human product and verified limits

Dinn chat guides Pons launch setup, wallet reads, supported sends, swaps, bridges, fee claims, and token research. The browser requests explicit wallet approval for signed actions. A funded Base-to-Robinhood bridge and a funded Pons launch were completed through Dinn on 14 November 2026. The resulting [DATR token on Pons](https://ponsfamily.com/launchpad/0x49B7B200ab5Ef1657e1dd9f0Edf53c69d68384C1) has a [verified launch transaction](https://robinhoodchain.blockscout.com/tx/0x322354170e0fa42b45d4028dcdd2bc375d4b0ba2d276023b6960af7f32943a46). A marketplace earnings withdrawal and all other signed wallet actions have not been live-funded in this verification pass. Dinn's embedded wallet does not automatically connect to the Pons site.

Production runs on Render with PostgreSQL. The separate Agent Market worker runs on a VPS and uses the Render database for recovery state. See [Pons integration status](docs/PONS-INTEGRATION.md) and [agent access](public/agent-guide.md) for exact capabilities and limits.

## Hackathon provenance

Dinn's Pons chat, launch, wallet tooling, and earlier NEAR research existed before this hackathon iteration. The baseline is commit [`29003cd`](https://github.com/Cyano88/dinn/commit/29003cd1377e0d9c8fef95552cf04ac053f479d1). The [NEAR agent-access work](https://github.com/Cyano88/dinn/compare/29003cd1377e0d9c8fef95552cf04ac053f479d1...feat/near-agent-access) added the public agent contract, evidence-backed token research, reference consumer, self-hosted NEAR Agent Market worker, funded hire/recovery flow, and related tests. Subsequent Pons and chat improvements are product work and should not be counted as NEAR integration. The primary submission track is **Agent Economy**.

The existing filmed Grail request is a recorded snapshot at Robinhood Chain block `112933500`, with bounded holder and lock coverage. It uses captured CLI output and a real marketplace hire record; it does not show a trade. It is not the unified Base-and-NEAR product demo, which has not been published. Older Elysium/Ascend implementation notes are preserved separately in [historical documentation](docs/README-HISTORY.md); they describe retired flows, not the live Dinn product.

## License

MIT. See [LICENSE](LICENSE).
