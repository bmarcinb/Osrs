# RuneGoldToken Contract Deployment Guide

This guide explains how to deploy the RuneGoldToken smart contract to Polygon Amoy testnet.

## Prerequisites

1. **MetaMask Wallet** with Polygon Amoy testnet configured
2. **Test MATIC** tokens (get from [Polygon Faucet](https://faucet.polygon.technology/))
3. **Node.js** and **npm** installed
4. **Private Key** for deployment (export from MetaMask)

## Setup

### 1. Install Hardhat

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
```

Select "Create a JavaScript project" when prompted.

### 2. Configure Hardhat

Create or update `hardhat.config.js`:

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    amoy: {
      url: "https://rpc-amoy.polygon.technology",
      accounts: [process.env.BLOCKCHAIN_PRIVATE_KEY],
      chainId: 80002
    }
  },
  etherscan: {
    apiKey: {
      polygonAmoy: process.env.POLYGONSCAN_API_KEY
    }
  }
};
```

### 3. Set Environment Variables

Create `.env` file in project root:

```bash
BLOCKCHAIN_PRIVATE_KEY=your_private_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here
```

⚠️ **SECURITY**: Never commit `.env` to version control! It's already in `.gitignore`.

### 4. Get Test MATIC

Visit [Polygon Faucet](https://faucet.polygon.technology/) and request test MATIC for Amoy testnet.

## Deployment

### 1. Create Deployment Script

Create `scripts/deploy.js`:

```javascript
const hre = require("hardhat");

async function main() {
  console.log("Deploying RuneGoldToken to Polygon Amoy...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "MATIC");

  // Deploy contract
  const RuneGoldToken = await hre.ethers.getContractFactory("RuneGoldToken");
  const token = await RuneGoldToken.deploy();

  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("✅ RuneGoldToken deployed to:", address);
  console.log("\nNext steps:");
  console.log("1. Update CONTRACT_ADDRESS in web/public/app.js");
  console.log("2. Update contractAddress in config/blockchain.json");
  console.log("3. Verify contract on PolygonScan:");
  console.log(`   npx hardhat verify --network amoy ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### 2. Copy Contract to Hardhat

```bash
cp contracts/RuneGoldToken.sol ./contracts/
```

### 3. Install OpenZeppelin Contracts

```bash
npm install @openzeppelin/contracts
```

### 4. Deploy

```bash
npx hardhat run scripts/deploy.js --network amoy
```

Expected output:
```
Deploying RuneGoldToken to Polygon Amoy...
Deploying with account: 0x...
Account balance: 1.5 MATIC
✅ RuneGoldToken deployed to: 0xAbC123...
```

## Post-Deployment

### 1. Update Configuration Files

**web/public/app.js:**
```javascript
const CONTRACT_ADDRESS = '0xYourDeployedAddress'; // Replace with deployed address
```

**config/blockchain.json:**
```json
{
  "enabled": true,
  "contractAddress": "0xYourDeployedAddress",
  ...
}
```

### 2. Verify Contract on PolygonScan

```bash
npx hardhat verify --network amoy 0xYourDeployedAddress
```

### 3. Test the Contract

Visit the web interface:
```bash
npm run start:webapi
# Open http://localhost:43595
```

Connect your MetaMask wallet and verify:
- Contract address is detected
- Wallet connection works
- Link account function is available

## Troubleshooting

### "Insufficient funds for gas"
- Get more test MATIC from the faucet
- Wait a few minutes and try again

### "Nonce too high"
- Reset your MetaMask account:
  - Settings → Advanced → Reset Account

### "Contract not found"
- Verify the contract address is correct
- Check you're on Amoy testnet (Chain ID: 80002)
- Ensure contract deployment was successful

### "Compilation error"
- Verify Solidity version matches (0.8.20)
- Check OpenZeppelin contracts are installed
- Ensure all imports are correct

## Network Details

**Polygon Amoy Testnet:**
- Chain ID: 80002
- RPC URL: https://rpc-amoy.polygon.technology
- Block Explorer: https://amoy.polygonscan.com
- Faucet: https://faucet.polygon.technology/

## Security Checklist

Before mainnet deployment:

- [ ] Audit smart contract code
- [ ] Test all functions on testnet
- [ ] Verify withdrawal limits work correctly
- [ ] Test rate limiting and cooldowns
- [ ] Verify pausable functionality
- [ ] Check reentrancy guards
- [ ] Test with multiple users
- [ ] Verify events are emitted correctly
- [ ] Test emergency pause scenario
- [ ] Document all admin functions

## Next Steps

1. Deploy to Amoy testnet and test thoroughly
2. Consider professional security audit
3. Deploy to Polygon mainnet when ready
4. Update all configuration files
5. Enable blockchain integration: `config/blockchain.json` → `"enabled": true`

## Support

For issues or questions:
- Check `docs/CRYPTO_ECONOMY.md` for system architecture
- See `docs/WEB_INTERFACE.md` for API documentation
- Review contract source: `contracts/RuneGoldToken.sol`
