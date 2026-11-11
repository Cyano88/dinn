# Launch wallet selection

Dinn keeps Google/X account authentication separate from the wallet used to launch. The launch wallet selector defaults to the Privy embedded wallet and can connect an external Ethereum browser wallet through Privy's connection-only flow. This version exposes detected browser wallets and MetaMask; WalletConnect QR/mobile pairing is not enabled.

The selection persists per Dinn account in this browser. An unavailable saved external wallet requires reconnection or an explicit selection of another wallet; it never silently falls back to the embedded wallet. Wallet selection checks the configured chain and active address without requesting a signature or transaction.

Account, chain and disconnect events invalidate the review and signing provider. Changing the selected wallet preserves the account's draft, logo, links and purchase amount. A fee recipient matching the previous deployer follows the new wallet; a different recipient stays unchanged. The final review displays the launch wallet. Pending approval and launch records remain keyed by their original account.

Validation: 263 unit tests passed. Browser fixtures exercised the real React selector, connection callback, reload preference and switching back, plus draft preservation, closing an old review, fee recipient behavior and retention of pending records. The fixtures do not prove a real extension connection or funded launch. No blockchain transaction was sent. Local testing still needs the user's extension approval; Render deployment remains separate.
