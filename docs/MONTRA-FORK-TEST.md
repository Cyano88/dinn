# Montra launch integration test

Run `node scripts/fork-montra.mjs` from the repository root on Windows x64 after installing dependencies. This starts the existing optional Anvil binary, pins Montra's public RPC head minus 128 blocks and binds the fork to `127.0.0.1:18546`. Results are written to `output/research/montra-fork-result.json`; the node and read-only relay shut down afterward. It refuses an occupied port.

The harness does not load `.env`, accept private keys, upload metadata, register a builder or send transactions to a public network. The upstream RPC relay only accepts read methods. Synthetic local accounts pay all launch and trading costs. Its example.invalid metadata URI is deliberately not published.

Verification covers:

- Read factory, router and lens from Montra's registry and check their deployed code.
- Select an enabled native HYPE launch configuration without an anti-snipe window; resolve its module's registered hook and read the launch fee.
- Simulate the same launch with and without the builder suffix; require identical returned token and pool identifiers.
- Execute locally and compare mined calldata with the exact factory call plus the ERC-8021 suffix. Independently parse the trailing code length, schema and marker.
- Verify TokenLaunched from the expected factory, creator, predicted token/pool, supply reconciled against mint/burn events, and seeded liquidity.
- Quote and execute a native-HYPE buy and an ERC-20-approved sell through Montra's LaunchRouter. Require matching balance deltas (native balance adjusted for gas), successful canonical receipts and Swapped events for the same pool and recipient.
- Require contract reverts for expired deadlines and impossible minimum outputs, without accepting transport errors as successful negative tests.

The test code `dinn-fork-test` is unregistered. Correct calldata establishes compatibility only: Montra's public indexer cannot see a local fork, and registration, attribution acceptance, programme approval and payout eligibility are not tested. Our own launch would not qualify for rewards. No production wallet or application configuration is changed.

A fresh, one-sided pool can report zero active liquidity at its opening boundary before its first trade. The harness checks the actual seeded position rather than assuming the active-liquidity field alone proves trading is unavailable, then tests executable buy/sell quotes and receipts.

Sources:
- https://montramarkets.xyz/docs/build.md
- https://montramarkets.xyz/docs/builders.md
- https://montramarkets.xyz/docs/abis/LaunchFactory.json
- https://montramarkets.xyz/docs/abis/LaunchRouter.json

This validates the deployed contracts in a local EVM fork, not Montra's live inbox submission route, bridge deposits/withdrawals, public metadata publication, production signing or every launch configuration.

## Verified result — November 7, 2026

Passed on Elysium fork block **2,059,976**, hash `0xcb17a639949dddf92119eb99be3980a2b7a5209fde9f27db6208a7e41ebdeea0`.

- Local-only token: Dinn Montra Fork Test (DMTEST), `0x67852EEaD0c87FB7b2e51f133bdB4A87018f755C`.
- Native-HYPE configuration 0, no first buy at launch, zero configured launch fee at this snapshot (gas still applies).
- `dinn-fork-test` suffix matched the mined calldata; with/without-suffix simulations returned the same token and pool.
- Minted 1 billion tokens; the launch burned 3,826 base units of seed rounding dust. Total supply and Transfer logs reconciled exactly.
- Bought with 0.01 local HYPE: received 234,145.117463498438527588 DMTEST; 200,464 gas.
- Sold half: received 0.004901073781248104 local HYPE; 137,909 gas. This is not a profit calculation: half the bought tokens remain, and both trades pay fees/gas.
- Exact quote/balance parity, canonical successful receipts, pool-specific Swapped events, minimum-output reverts and deadline reverts all passed.

These token/transaction identifiers exist only in the temporary fork. No public launch, metadata upload, builder registration or rewards occurred. The live inbox delivery route remains a separate integration test.
