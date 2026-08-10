# ARC App Kit USDC Send

StopDown uses ARC App Kit as an optional wallet-funding tool. It is deliberately outside lending
accounting and CLOB matching: the command only sends USDC to an ARC Testnet wallet before that
wallet interacts with the protocol.

## Configure

Set these values in the ignored root `.env` file:

```dotenv
APP_KIT_PRIVATE_KEY=0x...
APP_KIT_RECIPIENT_ADDRESS=0x...
APP_KIT_AMOUNT=1.00
```

Copy `config/env/app-kit.env.example` to the ignored `config/env/app-kit.env` and set the values
there. The App Kit command loads only that file; it does not read the backend `.env`.

Use a dedicated testnet wallet. The key stays in the local process and is not exposed through Vite
or the backend HTTP API.

## Estimate First

```powershell
npm.cmd run arc:app-kit:send
```

This validates the inputs and obtains an ARC fee estimate. It does not broadcast a transaction.

## Execute Explicitly

```powershell
npm.cmd run arc:app-kit:send -- --execute
```

The command estimates again and then broadcasts the USDC transfer through ARC App Kit. The
`--execute` flag is intentionally required so a configuration check cannot move funds.

This is an operator/reviewer tool, not the retail wallet UX. The implemented Circle User-Controlled
Wallet path reuses the existing contract calls and EIP-712 order format.
