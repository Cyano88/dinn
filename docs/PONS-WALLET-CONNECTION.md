# Pons wallet connection

Dinn can act as a WalletConnect wallet for the official Pons web app. The Dinn embedded wallet remains in Privy; the bridge never exports private keys. External launch wallets should be connected directly on Pons instead.

## User flow

1. Open Dinn Wallet and enable Pons connection.
2. Open Pons: Sign in -> Use a wallet -> WalletConnect -> Copy link.
3. Paste the connection link in Dinn and approve the domain/address/network review.
4. Keep Dinn open. Review and approve or reject each Pons request in Dinn, followed by Privy's wallet confirmation where applicable.
5. Disconnect from Dinn when finished. After reload, enable the connection service again; sessions are stored separately for each Dinn user and embedded address.

A verified launch now includes Open on Pons, using the exact receipt-confirmed token address. Opening the link does not establish a wallet connection. A one-click Dinn wallet listing inside Pons is not included; that requires wallet listing/Pons integration.

## Configuration

Set DINN_WALLETCONNECT_PROJECT_ID to the public WalletConnect Wallet project ID on local and Render environments. Missing configuration leaves the connection controls unavailable. CSP permits only the SDK relay/verification hosts when configured. Build with npm run build.

## Boundaries

Only verified https://ponsfamily.com or https://www.ponsfamily.com requests are accepted. UNKNOWN, mismatched, or scam verification is rejected. Only Robinhood Chain (4663), the exact embedded account and negotiated methods are accepted. Supported methods: personal_sign, eth_signTypedData_v4, eth_sendTransaction, wallet_switchEthereumChain (4663 only). Typed data must explicitly include chain 4663. Raw eth_sign, other networks, account substitution, and unsupported transaction delegation fields are rejected.

Every proposal/request requires user approval. Request dialogs are outside the Wallet view so requests remain visible in other tabs of the workspace. Logout/account changes remove listeners and invalidate pending approvals. Old sessions cannot sign under another Dinn account. Request records and browser locks prevent automatic duplicate sends. An ambiguous wallet result is retained as started and cannot automatically be retried; user must check wallet activity.

## Verification (2026-11-11)

277 Node tests passed, including domain, network, signer, namespace negotiation, expiry and receipt-gated handoffs. Browser fixture verified explicit proposal approval, no send before approval, rejection, one send after approval, replay without another send, wrong signer rejection, dialog visibility from Assistant, and disconnect. Real WalletConnect relay test received and verified a Pons proposal, rejected it, then established and disconnected a real Pons session with a synthetic test address. No real signature or blockchain transaction was requested. Actual Privy signing by the user's wallet and funded Pons actions remain unproven.

Official references:
- https://docs.walletconnect.com/wallets/web/usage
- https://docs.walletconnect.com/wallets/web/verify
- https://ponsfamily.com/launchpad
