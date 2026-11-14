# Dinn

Dinn helps people launch tokens on Pons and use wallet tools through a guided chat. Dinn Labs also gives autonomous trading agents sourced, read-only research about Pons tokens on Robinhood Chain. The paid research service is [live on NEAR AI Agent Market](https://market.near.ai/a/dinn).

**Try the product:** [dinn-pasy.onrender.com](https://dinn-pasy.onrender.com) · **Agent API:** [guide](public/agent-guide.md) · **Marketplace integration and evidence:** [technical record](docs/NEAR-MARKETPLACE.md)

## The agent service

An agent submits one Robinhood Chain token address. Dinn returns a dated report with a checked block and source links: Pons launch age and phase, bonding progress, curve trades, volume and generated fees, market references, contract controls, indexed holder balances and Pons buys/sells, sampled wallet history, and supported PinkLock lock or vesting records. The result marks missing and partial coverage. It never signs, places a trade, certifies safety, or treats a missing lock match as proof that supply is unlocked.

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

The [marketplace record](docs/NEAR-MARKETPLACE.md) documents a controlled $0.10 hire: Dinn delivered a report in 11 seconds, the buyer accepted it, and the marketplace recorded payment released. The buyer and seller accounts belonged to the same owner. This verifies the paid delivery path, not independent customer demand or an external-wallet withdrawal.

## Human product and verified limits

Dinn chat guides Pons launch setup, wallet reads, supported sends, swaps, bridges, fee claims, and token research. The browser requests explicit wallet approval for signed actions. A funded Base-to-Robinhood bridge and a funded Pons launch were completed through Dinn on 14 November 2026. The resulting [DATR token on Pons](https://ponsfamily.com/launchpad/0x49B7B200ab5Ef1657e1dd9f0Edf53c69d68384C1) has a [verified launch transaction](https://robinhoodchain.blockscout.com/tx/0x322354170e0fa42b45d4028dcdd2bc375d4b0ba2d276023b6960af7f32943a46). A marketplace earnings withdrawal and all other signed wallet actions have not been live-funded in this verification pass. Dinn's embedded wallet does not automatically connect to the Pons site.

Production runs on Render with PostgreSQL. The separate Agent Market worker runs on a VPS and uses the Render database for recovery state. See [Pons integration status](docs/PONS-INTEGRATION.md) and [agent access](public/agent-guide.md) for exact capabilities and limits.

## Hackathon provenance

Dinn's Pons chat, launch, wallet tooling, and earlier NEAR research existed before this hackathon iteration. The baseline is commit [`29003cd`](https://github.com/Cyano88/dinn/commit/29003cd1377e0d9c8fef95552cf04ac053f479d1). The [NEAR agent-access work](https://github.com/Cyano88/dinn/compare/29003cd1377e0d9c8fef95552cf04ac053f479d1...feat/near-agent-access) added the public agent contract, evidence-backed token research, reference consumer, self-hosted NEAR Agent Market worker, funded hire/recovery flow, and related tests. Subsequent Pons and chat improvements are product work and should not be counted as NEAR integration. The primary submission track is **Agent Economy**.

The filmed Grail request is a recorded snapshot at Robinhood Chain block `112933500`, with bounded holder and lock coverage. The video uses captured CLI output and a real marketplace hire record. It does not show a trade. See [demo narration and accuracy notes](docs/DINN-DEMO-VOICEOVER.md). Older Elysium/Ascend implementation notes are preserved separately in [historical documentation](docs/README-HISTORY.md); they describe retired flows, not the live Dinn product.

## License

MIT. See [LICENSE](LICENSE).
