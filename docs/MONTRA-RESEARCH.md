# Montra and pre-launch Elysium: verified research

Checked November 7, 2026, approximately 17:09-17:11 UTC (18:09-18:11 WAT). Read-only research; no wallet connection, signature, deposit or trade.

## Network and bridge

Kinetiq's connecting-to-elysium documentation, updated November 7, explicitly names mainnet chain 99901 and testnet 99801, while describing mainnet as pre-launch. Public mainnet explorer/RPC are marked coming soon. Mainnet activity and pre-launch status are not mutually exclusive.

Montra publishes HyperEVM inbox 0xce59f8B65ad41C9DAE4c07A0571a39824bD92cff. On HyperEVM chain 999 its bridge() resolves to 0x503D572157113fAaaD4DbeD2647Bb10b949216B6; that bridge's rollup() resolves to 0x508C173dFe5F737B3493195Bf785d71fA76fD217. The rollup reports chainId 99901, paused false and confirmPeriodBlocks 483840. This verifies the contract linkage, not a security audit or proof of completed withdrawal.

Montra documents signed Elysium transactions posted into the HyperEVM inbox, with HyperEVM posting gas sponsored by Montra. Its RPC only forwards permitted Montra actions; Ascend hook swaps are outside its documented scope. Public sequencer access, local fork execution and inbox delivery are different capabilities. Our successful Ascend fork tests did not establish live public delivery.

Withdrawal documentation describes roughly six days followed by a HyperEVM claim. No completed withdrawal was independently established in this investigation: the attempted outbox event query was rejected by the public RPC. Do not describe selling on Elysium as exiting to HyperEVM.

## Alfie evidence

Token: 0xda3040ab5ac51d9b82a439a03ce7009af4c7ff05.

Both Montra and Eleos RPCs report chain 99901, a 45-byte token clone and name Elysium Cat. Testnet 99801 returns no code. Montra's onchain registry resolves factory/router/lens addresses matching its API; its lens returns Alfie's pool key and the registry recognizes the hook. The pair is native HYPE (zero address), not Ascend's WHYPE pair.

A read-only LaunchRouter quote for 0.001 HYPE returned about 21,914.2611 tokens at the checked state, with a 1% effective buy and sell fee. Not a standing quote or recommendation.

Confirmed sale receipt 0xb021641139dc7231d3031d182021bcace941fcbd63750022cae65e9c1880ec9a at block 2041335 succeeds and matches its canonical block hash. PoolManager's decoded Swap event matches Alfie's pool 0x81182cdadfdad82d0527d282c2f3474dda99a29105dc114dc828c6dcff93cd09, with token input and native HYPE output. This establishes a historical sale, not universal future sellability or the trader's profitability.

At the API snapshot: approximately $3,489.52 FDV, six holders, 419 swaps (202 buys/217 sells), approximately $66,386.36 24-hour volume, and $683.66 last-hour volume. These are Montra indexer figures, not an independently rebuilt market history. They supersede the pasted alert only for this snapshot and may immediately change. liquiditySealed=false means outside liquidity is not prohibited; it does not by itself mean the original seed is withdrawable. No Kinetiq-team affiliation was verified.

## Dinn implications

- Keep Ascend launch integration; add venue identification before quoting any pasted token.
- A Montra adapter must resolve the registry and validate known hooks, native-vs-ERC20 quote assets and live effective fees. Do not pass Montra tokens into the Ascend-specific pool encoder.
- Reuse the human review, expiry, recovery and receipt design, with venue-specific encoding and submission policy.
- Funding should check the actual wallet's code on HyperEVM, including EIP-7702 delegation, before assuming same-address inbox deposits. An embedded wallet is not automatically a smart-contract wallet or automatically eligible.
- Inbox delivery needs distinct submitted-to-HyperEVM, awaiting-Elysium, executed/dropped/unknown states. A submission hash is not proof of execution; no blind resend or cancellation assumptions.
- Fresh inspection and executable quotes should replace stale token-alert figures. Initial product path: paste token, identify venue, check evidence and current quote, resolve funding, review, approve, track.
- Montra's builder programme rewards attributed launches, not trading volume itself. Published share is 25% of protocol fees for 90 days, subject to approval, aggregate weekly caps and exclusions. It is not guaranteed Dinn trading revenue.

Sources:
- https://elysium.kinetiq.xyz/docs/connecting-to-elysium
- https://montramarkets.xyz/docs/rpc
- https://montramarkets.xyz/docs/elysium
- https://montramarkets.xyz/docs/build
- https://montramarkets.xyz/docs/builders
- https://montramarkets.xyz/docs/api

Evidence: output/research/montra-network-verification.json, montra-pool-verification.json, montra-sale-exit-evidence.json and saved Montra API responses. No Dinn runtime configuration was changed.
