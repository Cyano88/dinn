# Server RPC configuration

Dinn's server supports dedicated read RPC endpoints for Robinhood Chain, Base, and Arbitrum. Set these in the Render service environment when using a provider endpoint:

| Environment variable | Chain | Public fallback |
| --- | --- | --- |
| `ROBINHOOD_RPC_URL` | Robinhood Chain (4663) | `https://rpc.mainnet.chain.robinhood.com` |
| `BASE_RPC_URL` | Base (8453) | `https://mainnet.base.org` |
| `ARBITRUM_RPC_URL` | Arbitrum One (42161) | `https://arb1.arbitrum.io/rpc` |

Leave an override blank to use the public fallback. Production and Render overrides must use HTTPS. Local development may use HTTP only on loopback. Invalid values fail with a generic error that does not echo the configured URL.

These are server-side settings. Provider URLs can contain credentials, so do not put them in browser configuration, public RPC settings, chat messages, or source control. `ROBINHOOD_PUBLIC_RPC_URL` is a separate browser-facing wallet connection setting and should only contain a URL intended to be public.

Wallet and bridge reads verify the connected RPC's chain ID. Base stock-paired research also passes its configured Base endpoint to the chain-pinned contract inspector and uses it for Base receipt and bytecode reads. These checks detect a wrong network or stale snapshot; they do not measure provider uptime. Dedicated RPC overrides have not yet been tested against Render or live provider credentials.
