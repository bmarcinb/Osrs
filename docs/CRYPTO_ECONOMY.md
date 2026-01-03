# Crypto Economy System Documentation

## Overview

The Crypto Economy System integrates blockchain technology with the in-game economy, allowing players to deposit and withdraw ERC-20 tokens (RuneGold - RGP) on the Polygon network that are backed 1:1 with in-game gold. This system maintains the existing visual representation of gold/coins while adding cryptocurrency backing under the hood.

## Architecture

```
┌─────────────────────┐
│   Player Client     │
│  (Shows Gold/Coins) │
└──────────┬──────────┘
           │
           │ Packet Communication
           │
┌──────────▼──────────┐
│   Game Server       │
│ ┌─────────────────┐ │
│ │ Player Gold     │ │
│ │ Balance System  │ │
│ └────────┬────────┘ │
│          │          │
│ ┌────────▼────────┐ │
│ │ Blockchain      │ │
│ │ Service Layer   │ │
│ └────────┬────────┘ │
└──────────┼──────────┘
           │
           │ Web3/Ethers
           │
┌──────────▼──────────┐
│  Polygon Network    │
│ ┌─────────────────┐ │
│ │  RuneGoldToken  │ │
│ │  Smart Contract │ │
│ └─────────────────┘ │
└─────────────────────┘
```

## Components

### 1. Smart Contract (`contracts/RuneGoldToken.sol`)

**Features:**
- ERC-20 compliant token
- Name: "RuneGold", Symbol: "RGP"
- 0 decimals (1 token = 1 gold, no fractional amounts)
- Game account linking (privacy-preserving with hashed identifiers)
- Deposit/withdrawal functionality
- Rate limiting and security features
- Emergency pause capability

**Key Functions:**
- `linkGameAccount(bytes32 gameAccountHash)` - Link wallet to game account
- `deposit(uint256 amount)` - Deposit tokens to play
- `withdraw(uint256 amount)` - Withdraw tokens from game
- `isLinked(address wallet)` - Check link status
- `getGameAccountHash(address wallet)` - Get linked game account

**Security:**
- Pausable contract for emergencies
- Reentrancy guards
- Withdrawal cooldown (default: 5 minutes)
- Withdrawal limits (min: 1000, max: 1,000,000)
- Owner-only administrative functions

### 2. Web3 Provider (`src/engine/world/economy/web3-provider.ts`)

Handles blockchain connectivity and contract interaction.

**Features:**
- Connects to Polygon network via RPC
- Initializes smart contract interface
- Manages wallet and provider instances
- Query functions for balances and account status
- Transaction handling and confirmation

**Configuration:** `config/blockchain.json`

```json
{
  "enabled": false,
  "network": "polygon",
  "rpcUrl": "https://polygon-rpc.com",
  "contractAddress": "0x...",
  "privateKey": "env:BLOCKCHAIN_PRIVATE_KEY",
  "gasLimit": 100000,
  "confirmations": 12,
  "withdrawalCooldown": 300,
  "minWithdrawal": 1000,
  "maxWithdrawal": 1000000
}
```

### 3. Blockchain Service (`src/engine/world/economy/blockchain-service.ts`)

Core service layer for crypto wallet management.

**Key Functions:**

#### `connectWallet(player, walletAddress, signature)`
- Verifies wallet ownership via signature
- Links wallet to player account
- Stores wallet info in player data

#### `depositTokens(player, amount, txHash)`
- Verifies blockchain transaction
- Waits for confirmations
- Credits in-game gold to player

#### `withdrawTokens(player, amount)`
- Verifies sufficient gold balance
- Checks withdrawal limits and cooldown
- Deducts gold and initiates blockchain transaction
- Returns transaction hash

#### `getBlockchainBalance(walletAddress)`
- Queries token balance from blockchain

#### `syncBalance(player)`
- Reconciles internal and blockchain state

### 4. Migration Service (`src/engine/world/economy/migration.ts`)

Handles data migration from coin-based to gold balance system.

**Functions:**
- `migratePlayerCoinsToGold(player)` - Converts coins to gold balance
- `needsMigration(player)` - Checks if migration needed
- `ensureBackwardCompatibility(player)` - Ensures gold balance initialized

### 5. Player Gold Management

Updated `Player` class with new methods:

#### `getGold(): number`
Returns player's total gold balance.

#### `addGold(amount: number): void`
Adds gold to player's balance (from deposits or gameplay).

#### `removeGold(amount: number): boolean`
Removes gold from balance (for purchases or withdrawals).
Returns false if insufficient balance.

#### `updateGoldDisplay(): void`
Synchronizes the visual coin display with internal gold balance.

#### `hasCoins(amount: number): number`
Updated to check gold balance first, maintains backward compatibility.

### 6. Network Packets

Four new packet handlers for client-server communication:

#### `crypto-wallet-link.packet.ts` (Opcode: 200)
Handles wallet linking requests.
- Input: wallet address, signature
- Output: success/failure message

#### `crypto-deposit.packet.ts` (Opcode: 201)
Handles token deposit requests.
- Input: amount, transaction hash
- Output: confirmation and gold credit

#### `crypto-withdraw.packet.ts` (Opcode: 202)
Handles withdrawal requests.
- Input: amount
- Output: transaction hash

#### `crypto-balance-sync.packet.ts` (Opcode: 203)
Handles balance check requests.
- Input: none
- Output: in-game and blockchain balances

## Setup Instructions

### Prerequisites

1. Node.js and npm installed
2. Access to Polygon network (testnet or mainnet)
3. Wallet with MATIC for gas fees
4. Deployed RuneGoldToken contract

### Installation

1. **Install Dependencies:**
```bash
npm install
```

This will install the newly added packages:
- `ethers@^6.9.0` - Ethereum library
- `web3@^4.3.0` - Web3 library

2. **Deploy Smart Contract:**

For testing, use Polygon Mumbai testnet:

```bash
# Install Hardhat
npm install --save-dev hardhat @nomiclabs/hardhat-ethers

# Initialize Hardhat
npx hardhat init

# Deploy contract
npx hardhat run scripts/deploy.js --network mumbai
```

3. **Configure Environment:**

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

Edit `.env`:
```
BLOCKCHAIN_ENABLED=true
POLYGON_RPC_URL=https://rpc-mumbai.maticvigil.com
CONTRACT_ADDRESS=0xYourDeployedContractAddress
BLOCKCHAIN_PRIVATE_KEY=your_private_key_here
NETWORK_ID=80001
```

4. **Update Blockchain Configuration:**

Edit `config/blockchain.json`:
```json
{
  "enabled": true,
  "network": "polygon",
  "rpcUrl": "https://rpc-mumbai.maticvigil.com",
  "contractAddress": "0xYourDeployedContractAddress",
  "privateKey": "env:BLOCKCHAIN_PRIVATE_KEY",
  "gasLimit": 100000,
  "confirmations": 12,
  "withdrawalCooldown": 300,
  "minWithdrawal": 1000,
  "maxWithdrawal": 1000000
}
```

5. **Build and Start Server:**

```bash
npm run build
npm run start
```

## Player User Guide

### Linking Your Wallet

1. Ensure you have a Polygon-compatible wallet (MetaMask, etc.)
2. In-game, use the wallet link interface
3. Sign the message to prove wallet ownership
4. Wallet is now linked to your game account

### Depositing Tokens

1. Ensure your wallet is linked
2. Use the contract's `deposit()` function or game interface
3. Approve token transfer if needed
4. Call deposit with desired amount
5. Wait for transaction confirmation (12 blocks)
6. Gold appears in your in-game balance

### Withdrawing Tokens

1. Ensure you have sufficient in-game gold
2. Use the withdrawal interface in-game
3. Specify amount (within limits)
4. Wait for cooldown if recently withdrawn
5. Transaction is processed, tokens sent to wallet

### Checking Balance

Use the balance sync feature to view:
- Current in-game gold
- Blockchain token balance
- Wallet address

## Developer API Reference

### Blockchain Service

```typescript
import { getBlockchainService } from '@engine/world/economy/blockchain-service';

const service = getBlockchainService();

// Initialize service
await service.initialize();

// Check if enabled
if (service.isEnabled()) {
  // Connect wallet
  await service.connectWallet(player, walletAddress, signature);
  
  // Process deposit
  await service.depositTokens(player, amount, txHash);
  
  // Process withdrawal
  const txHash = await service.withdrawTokens(player, amount);
  
  // Get balance
  const balance = await service.getBlockchainBalance(walletAddress);
  
  // Sync balance
  await service.syncBalance(player);
}
```

### Player Gold Management

```typescript
// Get gold balance
const gold = player.getGold();

// Add gold
player.addGold(1000);

// Remove gold
const success = player.removeGold(500);

// Update display
player.updateGoldDisplay();
```

### Migration

```typescript
import { MigrationService } from '@engine/world/economy/migration';

// Check if migration needed
if (MigrationService.needsMigration(player)) {
  // Migrate player
  MigrationService.migratePlayerCoinsToGold(player);
}

// Ensure compatibility
MigrationService.ensureBackwardCompatibility(player);
```

## Security Considerations

### Transaction Verification

- Always verify blockchain transactions before crediting gold
- Wait for multiple confirmations (default: 12 blocks)
- Check transaction events match expected values

### Rate Limiting

- Withdrawal cooldown prevents rapid withdrawals
- Configurable per deployment

### Withdrawal Limits

- Minimum: 1000 gold (configurable)
- Maximum: 1,000,000 gold (configurable)
- Prevents exploits and large unauthorized transfers

### Session Management

- One-time signature per login session
- Session tokens expire after logout
- No constant wallet approvals needed during play

### Anti-Fraud

- All transactions logged
- Monitor for suspicious patterns
- Double-spend prevention
- Replay attack prevention

## Troubleshooting

### Blockchain Integration Disabled

**Issue:** "Cryptocurrency features are currently disabled"

**Solution:** 
- Check `config/blockchain.json` - ensure `enabled: true`
- Verify environment variables are set
- Check server logs for initialization errors

### Transaction Not Confirmed

**Issue:** Deposit not credited after transaction

**Solution:**
- Wait for full confirmations (12 blocks ≈ 24 seconds on Polygon)
- Check transaction on PolygonScan
- Verify transaction hash is correct
- Check server logs for processing errors

### Withdrawal Failed

**Issue:** Cannot withdraw tokens

**Solutions:**
- Check cooldown: Must wait 5 minutes between withdrawals
- Verify amount within limits (1000 - 1,000,000)
- Ensure sufficient in-game gold
- Check contract has sufficient token balance

### Wallet Already Linked

**Issue:** Cannot link wallet to account

**Solution:**
- Each wallet can only be linked to one account
- Use a different wallet or contact support

### Gas Estimation Errors

**Issue:** Transactions fail with gas errors

**Solution:**
- Ensure wallet has sufficient MATIC for gas
- Increase `gasLimit` in configuration
- Check network congestion

## Testing

### Unit Tests

Run tests for individual components:

```bash
npm test
```

### Integration Testing

1. Deploy contract to Mumbai testnet
2. Configure server with testnet settings
3. Test full deposit/withdrawal flow
4. Verify balance synchronization

### Manual Testing Checklist

- [ ] Link wallet to account
- [ ] Deposit tokens and verify gold credit
- [ ] Withdraw tokens and verify deduction
- [ ] Check cooldown enforcement
- [ ] Verify withdrawal limits
- [ ] Test balance synchronization
- [ ] Test with new player (no migration)
- [ ] Test with existing player (migration)

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Code reviewed and audited
- [ ] Smart contract audited
- [ ] Configuration files updated
- [ ] Environment variables set
- [ ] Backup existing database

### Mainnet Deployment

1. Deploy contract to Polygon mainnet
2. Verify contract on PolygonScan
3. Update configuration with mainnet settings
4. Test with small amounts first
5. Monitor for issues
6. Gradually roll out to all players

### Post-Deployment

- [ ] Monitor server logs
- [ ] Monitor contract events
- [ ] Track transaction success rates
- [ ] Gather player feedback
- [ ] Address issues promptly

## Maintenance

### Regular Tasks

- Monitor contract balance
- Review transaction logs
- Update RPC endpoints if needed
- Adjust limits based on usage

### Emergency Procedures

If critical issue detected:

1. Pause smart contract (owner only)
2. Disable blockchain integration in config
3. Investigate issue
4. Fix and test
5. Re-enable system

## Support

For issues or questions:

1. Check server logs: `logs/blockchain-service.log`
2. Review documentation above
3. Check contract on PolygonScan
4. Contact development team

## Future Enhancements

Potential improvements:

- Multi-chain support (Ethereum, BSC)
- Trading marketplace with RGP
- Staking rewards
- Governance features
- Mobile wallet integration
- Direct wallet-to-wallet trading

## License

This system is part of the RuneJS server project and follows the same GPL-3.0 license.

## References

- [Polygon Documentation](https://docs.polygon.technology/)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [ERC-20 Token Standard](https://eips.ethereum.org/EIPS/eip-20)
