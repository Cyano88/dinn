# Token inspection - first read-only release

Human chat and terminal plan requests recognize token-address questions. The browser retains a selected inspection address per account in the current tab; this is independent of launch/deployer/fee-recipient addresses. Follow-up questions re-read the selected contract. Explicit wallet-field answers do not silently become inspection targets.

## Evidence

The configured ELYSIUM_RPC_URL is read server-side and checked against ELYSIUM_AUTH_CHAIN_ID (99801 testnet or 99901 mainnet). No mainnet address is assumed to represent the same contract on testnet. Reads pin to a block and the block hash is rechecked before returning findings. The private endpoint is never included in output.

Implemented reads: bytecode, optional name/symbol/decimals/totalSupply/owner, standard EIP-1967 implementation and beacon slots. Failed optional reads remain unknown. Zero owner is not proof that all control was renounced; empty standard proxy slots do not rule out other proxy types.

Source verification uses Sourcify v2. It requires matching chain, address, accepted runtime verification status and byte-for-byte equality between the record and code read at the report block. Missing records or API errors are unknown, not unverified on every explorer. Mutating control-function names in a matched ABI are review indicators, not a permissions audit. A matched proxy runtime does not verify implementation behavior.

Reports are deterministic and rendered as text, with method evidence and source links. Contract metadata is untrusted. No transaction is prepared or sent.

## Not yet verified

LP lock state, lock amount and unlock date need pool-specific contract/position adapters. Sellability needs fresh buy/sell simulation and liquidity data. Holder concentration and dev allocation need indexed balances and deployer attribution. These fields explicitly remain unknown. Daily quotas and token-lock benefits are separate pending work.

## Validation

58 tests passed. Live testnet checks matched a Sourcify record for 0x8841301D3EC2daCA8b4E430C72770e2beD1B7cBb (reports MINOS PASS / MPASS; decimals unavailable, so supply is reported in raw units rather than assumed ERC-20 decimals). This address is test evidence, not an endorsement. Browser fixture login exercised real chain calls, selected-address follow-ups, source matching, unknown LP state and mobile layout.

Sources: https://docs.sourcify.dev/docs/api/ ; https://eips.ethereum.org/EIPS/eip-1967 ; https://www.alchemy.com/docs/reference/elysium-api-faq . Ascend mainnet deployments are documented at https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts.md and are not reused on testnet.
