# RuneGold Wallet - Companion Web Interface

This is a companion web application for managing cryptocurrency-backed in-game gold in the OSRS server.

## Overview

Since the game uses a Java client (client435) which cannot directly interact with browser-based crypto wallets like MetaMask, this companion web interface provides a bridge between players' crypto wallets and their in-game accounts.

## Features

- **Wallet Connection**: Connect your MetaMask wallet to the Polygon network
- **Account Linking**: Link your crypto wallet to your in-game username
- **Balance Display**: View both your wallet balance (RGP tokens) and in-game gold
- **Deposits**: Transfer RGP tokens from your wallet to in-game gold (1:1 ratio)
- **Withdrawals**: Convert in-game gold to RGP tokens in your wallet
- **Real-time Updates**: Automatically refreshes balances after transactions

## Prerequisites

- MetaMask browser extension installed
- RGP tokens in your wallet (for deposits)
- A game account on the OSRS server
- Node.js and npm installed (for running the API server)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure the Web API server in `config/web-api.json`:
```json
{
    "enabled": true,
    "port": 43595,
    "host": "0.0.0.0"
}
```

3. Configure blockchain settings in `config/blockchain.json`:
```json
{
    "enabled": true,
    "network": "polygon",
    "rpcUrl": "https://polygon-rpc.com",
    "contractAddress": "0xYourContractAddress",
    "privateKey": "env:BLOCKCHAIN_PRIVATE_KEY",
    "gasLimit": 100000,
    "confirmations": 12,
    "withdrawalCooldown": 300,
    "minWithdrawal": 1000,
    "maxWithdrawal": 1000000
}
```

4. Set environment variables in `.env`:
```bash
BLOCKCHAIN_PRIVATE_KEY=your_server_wallet_private_key
```

## Running the Web Interface

### Start the Web API Server

The Web API server provides HTTP endpoints for the web interface to communicate with the game server.

```bash
npm run build
npm run start:webapi
```

Or run alongside other servers:
```bash
npm run start  # Starts all servers including webapi
```

The web interface will be available at: `http://localhost:43595`

## Usage

### For Players

1. **Open the Web Interface**
   - Navigate to `http://localhost:43595` in your browser
   - Make sure MetaMask is installed and unlocked

2. **Connect Your Wallet**
   - Click "Connect MetaMask"
   - Approve the connection in MetaMask
   - The app will automatically switch to Polygon network if needed

3. **Link Your Game Account**
   - Enter your in-game username
   - Click "Link Account"
   - Sign the message in MetaMask to verify ownership

4. **Deposit Tokens**
   - Enter the amount of RGP tokens to deposit
   - Click "Deposit to Game"
   - Approve the transaction in MetaMask
   - Wait for confirmation (takes ~30 seconds)
   - Your in-game gold will be updated

5. **Withdraw Tokens**
   - Enter the amount of gold to withdraw (min: 1000, max: 1,000,000)
   - Click "Withdraw to Wallet"
   - The transaction will be processed
   - RGP tokens will appear in your wallet

6. **Check Balances**
   - Balances are automatically updated after transactions
   - Click "🔄 Refresh Balance" to manually update

### For Developers

The Web API server exposes these endpoints:

- `GET /api/health` - Health check
- `POST /api/crypto/link` - Link wallet to game account
- `POST /api/crypto/deposit` - Process token deposit
- `POST /api/crypto/withdraw` - Process withdrawal request
- `GET /api/crypto/balance?username=<username>` - Get balance

## Architecture

```
┌──────────────────┐
│  Web Browser     │
│  (MetaMask)      │
└────────┬─────────┘
         │ HTTP/JSON
         │
┌────────▼─────────┐       ┌──────────────┐
│  Web API Server  │◄──────┤ Game Server  │
│  (Port 43595)    │       │ (Port 43594) │
└────────┬─────────┘       └──────────────┘
         │
         │ Web3/Ethers
         │
┌────────▼─────────┐
│  Polygon Network │
│  (RGP Contract)  │
└──────────────────┘
```

## Security Considerations

- **Wallet Signatures**: All wallet links require signature verification
- **Transaction Verification**: Deposits verify blockchain transactions before crediting gold
- **Rate Limiting**: Withdrawals have cooldown periods and amount limits
- **Session Management**: Wallet connections are session-based
- **Data Validation**: All inputs are validated before processing

## Troubleshooting

### MetaMask Not Detected
- Make sure MetaMask extension is installed
- Refresh the page after installing MetaMask

### Wrong Network
- The app will automatically prompt to switch to Polygon
- Approve the network switch in MetaMask

### Transaction Failed
- Check you have enough MATIC for gas fees
- Ensure you have sufficient RGP tokens for deposits
- Verify withdrawal limits (min: 1000, max: 1,000,000)

### Balance Not Updating
- Wait for blockchain confirmations (12 blocks, ~30 seconds)
- Click "🔄 Refresh Balance" to manually update
- Check the game server logs for errors

## File Structure

```
web/
├── public/
│   ├── index.html    # Main web interface
│   └── app.js        # Client-side JavaScript
└── README.md         # This file

src/server/
└── web-api-server.ts # API server implementation

config/
├── blockchain.json   # Blockchain configuration
└── web-api.json      # Web API configuration
```

## Production Deployment

For production deployment:

1. Use HTTPS (set up reverse proxy with nginx or Apache)
2. Configure proper CORS origins
3. Enable rate limiting on API endpoints
4. Use a production-grade database instead of file-based saves
5. Implement proper session management
6. Add monitoring and logging
7. Use environment-specific configuration files

## Support

For issues or questions:
- Check the main documentation in `docs/CRYPTO_ECONOMY.md`
- Review game server logs
- Check blockchain transaction status on PolygonScan

## License

GPL-3.0 - Same as the main OSRS server project
