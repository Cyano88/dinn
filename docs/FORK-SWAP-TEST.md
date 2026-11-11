# Ascend local fork integration

Run from the repository root on Windows x64:

```powershell
npm ci
node scripts/fork-swap.mjs
# If the provider has pruned that historical state:
node scripts/fork-swap.mjs --fresh-block
```

The harness starts its own Anvil instance on `127.0.0.1:18545`, forks Elysium chain 99901 at block 1,868,843 through `https://rpc.boxa.club`, and shuts down afterward. With `--fresh-block`, it pins the RPC head minus 128 blocks and records the chosen block and hash. The public RPC is not a guaranteed archive: the original block later returned a missing-trie-node error. It refuses an occupied endpoint. It needs no `.env`, private key, real wallet, faucet or funded public pool. The Windows binary is an optional dependency; other operating systems need a corresponding Anvil binary and executable-path adjustment.

The upstream relay permits only read methods. All writes go to the newly created local node. A synthetic Anvil account pays with local funds. No deployed contracts' code or storage are overwritten.

The test checks deployed code, reads current launch rules at the fork, launches a fresh WHYPE pool through `launchChecked`, wraps local HYPE, obtains V4Quoter quotes, grants bounded ERC-20/Permit2 allowances and executes both buy and sell through UniversalRouter 2.2. It verifies receipts, balance changes, matching HookSwap events, and contract reverts for impossible minimum output and expired deadlines.

Results, including local-only transaction hashes, are saved to `output/research/fork-swap-result.json`. These hashes and the newly created token address do not exist on the public network.

The harness also exercises Dinn's `quoteSwap`, `createSwapSubmitter` and `swapReceipt` modules through bounded approval, Permit2 and confirmed buy/sell steps. This passed at block 1,920,563 on November 7, 2026. Public execution remains disabled. `/api/swap/quote` and `/api/swap/receipt` require `ENABLE_LOCAL_SWAP_PREVIEW=true`, chain 99901, a loopback HTTP RPC URL and a successful `anvil_nodeInfo` fork check. The default `.env` was not changed.

Wallet → Swap and chat trading requests open the same form. The local preview displays the exact next wallet action, fee-inclusive quote, minimum output, slippage and estimated step gas. A fresh quote is required after each preparation step. Native HYPE can be wrapped to cover a WHYPE shortage; selling returns WHYPE without automatic unwrapping. Quote expiry, wallet changes and edited fields invalidate approval. Pending or unknown submissions are persisted and block retries until recovery. Receipt checks require the saved transaction, canonical block and matching swap event, with two confirmations.

ABI fragments follow Ascend's published [integration guide](https://ascendlaunch.gitbook.io/docs/developers/integration-guide) and [ABI documentation](https://ascendlaunch.gitbook.io/docs/developers/abis-and-events). The downloadable full ABI bundle was previously blocked by HTTP 403; this test does not claim to have verified that bundle's checksum.

Passing proves compatibility with this forked state, not production readiness. It does not establish current public liquidity, performance under competing transactions, private-key or embedded-wallet behavior, or support for every pair/token. It does not resolve which older testnet deployment Ascend currently supports. Dinn's public swaps remain disabled. Production needs a fresh deployment/code verification, wallet review and signing integration, quote expiry and slippage controls, balance/allowance checks, and transaction recovery.
