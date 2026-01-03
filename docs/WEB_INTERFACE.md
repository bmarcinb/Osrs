# Companion Web Interface Implementation

This document describes the companion web interface implementation for the cryptocurrency economy system.

## Overview

Since the OSRS game uses a Java client (client435) which cannot directly interact with browser-based crypto wallets, we've implemented a companion web application that serves as a bridge between players' crypto wallets and their in-game accounts.

## Architecture

```
┌──────────────────────────┐
│    Player's Browser      │
│  ┌──────────────────┐    │
│  │   MetaMask       │    │
│  │   (Wallet)       │    │
│  └─────────┬────────┘    │
│            │              │
│  ┌─────────▼────────┐    │
│  │  Web Interface   │    │
│  │  (HTML/JS)       │    │
│  └─────────┬────────┘    │
└────────────┼─────────────┘
             │ HTTP/JSON API
             │
┌────────────▼─────────────┐
│   Web API Server         │
│   (Express.js)           │
│   Port: 43595            │
└────────────┬─────────────┘
             │
             ├──────────────────┐
             │                  │
┌────────────▼─────────┐  ┌────▼──────────┐
│   Game Server        │  │  Polygon      │
│   (Player Data)      │  │  Blockchain   │
│   Port: 43594        │  │  (RGP Token)  │
└──────────────────────┘  └───────────────┘
```

## Components

### 1. Web Interface (`web/public/`)

A single-page web application built with vanilla JavaScript:

- **index.html**: Main interface with modern UI
- **app.js**: Client-side logic for wallet interaction and API calls

**Features:**
- MetaMask wallet connection
- Automatic Polygon network switching
- Account linking with signature verification
- Real-time balance display
- Token deposit interface
- Gold withdrawal interface
- Transaction status updates

### 2. Web API Server (`src/server/web-api-server.ts`)

Express.js-based HTTP API server that provides:

- **POST /api/crypto/link**: Link wallet to game account
- **POST /api/crypto/deposit**: Process token deposits
- **POST /api/crypto/withdraw**: Initiate withdrawals
- **GET /api/crypto/balance**: Get current balances
- **GET /**: Serve web interface

**Security Features:**
- CORS configuration
- Signature verification
- Input validation
- Rate limiting ready
- Error handling

### 3. Configuration (`config/web-api.json`)

```json
{
    "enabled": true,
    "port": 43595,
    "host": "0.0.0.0"
}
```

## Usage

### Starting the Web Interface

```bash
# Build the project
npm run build

# Start the Web API server
npm run start:webapi

# Or start all servers including web API
npm run start
```

The web interface will be available at: `http://localhost:43595`

### Player Workflow

1. **Connect Wallet**
   - Player opens `http://localhost:43595` in browser
   - Clicks "Connect MetaMask"
   - Approves connection in MetaMask
   - App switches to Polygon network if needed

2. **Link Game Account**
   - Player enters their in-game username
   - Signs a message to prove wallet ownership
   - Wallet is linked to their game account

3. **Deposit Tokens**
   - Player enters amount of RGP tokens to deposit
   - Approves and signs blockchain transaction
   - Web API verifies transaction on blockchain
   - In-game gold balance is updated

4. **Withdraw Tokens**
   - Player enters amount of gold to withdraw
   - Web API checks balance and limits
   - Blockchain transaction is initiated
   - RGP tokens are sent to player's wallet

5. **Check Balances**
   - Balances displayed automatically
   - Manual refresh available
   - Shows both wallet and in-game balances

## API Endpoints

### Link Wallet to Account

```
POST /api/crypto/link
Content-Type: application/json

{
  "username": "PlayerName",
  "walletAddress": "0x...",
  "signature": "0x...",
  "message": "Link wallet to PlayerName at 1234567890"
}

Response:
{
  "success": true
}
```

### Process Deposit

```
POST /api/crypto/deposit
Content-Type: application/json

{
  "username": "PlayerName",
  "walletAddress": "0x...",
  "amount": 1000,
  "txHash": "0x..."
}

Response:
{
  "success": true,
  "goldBalance": 5000
}
```

### Request Withdrawal

```
POST /api/crypto/withdraw
Content-Type: application/json

{
  "username": "PlayerName",
  "walletAddress": "0x...",
  "amount": 2000
}

Response:
{
  "success": true,
  "txHash": "0x...",
  "goldBalance": 3000
}
```

### Get Balance

```
GET /api/crypto/balance?username=PlayerName

Response:
{
  "success": true,
  "goldBalance": 5000,
  "walletAddress": "0x..."
}
```

## Integration with Game Server

The Web API server communicates with the game server through:

1. **File-based Player Saves**: Reads/writes player save files directly (simplified for MVP)
2. **Blockchain Service**: Uses existing blockchain-service.ts for transaction verification
3. **Event System**: Can be extended to notify game server of balance changes

### Future Improvements

For production, the integration should use:

- **WebSocket/Socket.IO**: Real-time communication between Web API and Game Server
- **Database**: Shared database instead of file-based saves
- **Message Queue**: For reliable transaction processing
- **Session Management**: Coordinate player sessions between web and game
- **Rate Limiting**: Implement proper rate limiting on API endpoints

## Security Considerations

### Implemented

- ✅ Signature verification for wallet linking
- ✅ Transaction verification on blockchain
- ✅ Input validation on all endpoints
- ✅ CORS configuration
- ✅ Error handling and logging

### Recommended for Production

- [ ] HTTPS/TLS encryption
- [ ] API key authentication
- [ ] Rate limiting per IP/wallet
- [ ] DDoS protection
- [ ] Session management with Redis
- [ ] Audit logging
- [ ] Transaction replay prevention
- [ ] Multi-signature for large withdrawals

## Testing

### Manual Testing

1. Start Web API server: `npm run start:webapi`
2. Open browser to `http://localhost:43595`
3. Connect MetaMask (use testnet)
4. Link a test account
5. Try deposit/withdrawal flows

### Automated Testing

Unit tests can be added for:
- API endpoint responses
- Signature verification
- Transaction parsing
- Balance calculations

## Deployment

### Development

```bash
npm run start:webapi
```

### Production

1. Build optimized bundle:
```bash
npm run build
```

2. Use process manager (PM2):
```bash
pm2 start dist/server/runner.js --name webapi -- -webapi
```

3. Set up reverse proxy (nginx):
```nginx
server {
    listen 80;
    server_name wallet.yourdomain.com;

    location / {
        proxy_pass http://localhost:43595;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. Enable HTTPS with Let's Encrypt

## Troubleshooting

### Web API Server Won't Start

- Check port 43595 is not in use
- Verify config/web-api.json exists and is valid
- Check server logs for errors

### MetaMask Not Connecting

- Ensure MetaMask is installed and unlocked
- Refresh the page
- Check browser console for errors

### Transactions Failing

- Verify sufficient MATIC for gas fees
- Check blockchain.json configuration
- Ensure contract address is correct
- Review blockchain service logs

### Balance Not Updating

- Wait for blockchain confirmations
- Click manual refresh
- Check Web API server logs
- Verify player save file integrity

## Files Created

- `web/public/index.html` - Web interface UI
- `web/public/app.js` - Client-side JavaScript
- `web/README.md` - User documentation
- `src/server/web-api-server.ts` - API server implementation
- `config/web-api.json` - Configuration file
- `docs/WEB_INTERFACE.md` - This file

## References

- Main documentation: `docs/CRYPTO_ECONOMY.md`
- Smart contract: `contracts/RuneGoldToken.sol`
- Blockchain service: `src/engine/world/economy/blockchain-service.ts`
- Web3 provider: `src/engine/world/economy/web3-provider.ts`
