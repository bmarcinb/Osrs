/**
 * Web API Server for Crypto Wallet Management
 * Provides HTTP API endpoints for the companion web interface
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@runejs/common';
import { getBlockchainService } from '@engine/world/economy/blockchain-service';
import { loadPlayerSave, savePlayerSaveData } from '@engine/world/actor/player/player-data';

// Load environment variables from .env file
config();

// Load currency configuration
let COINS_ITEM_ID = 995; // Default fallback
try {
    const currencyConfigPath = join('data', 'config', 'items', 'currency.json');
    if (existsSync(currencyConfigPath)) {
        const currencyConfig = JSON.parse(readFileSync(currencyConfigPath, 'utf8'));
        if (currencyConfig['rs:coins']?.game_id) {
            COINS_ITEM_ID = currencyConfig['rs:coins'].game_id;
            logger.info(`Loaded coins item ID from currency.json: ${COINS_ITEM_ID}`);
        }
    }
} catch (error) {
    logger.warn('Failed to load currency config, using default coins item ID (995)');
}

export interface WebApiConfig {
    enabled: boolean;
    port: number;
    host: string;
}

export class WebApiServer {
    private app: express.Application;
    private config: WebApiConfig;
    private blockchainService = getBlockchainService();

    constructor() {
        this.config = this.loadConfig();
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    private loadConfig(): WebApiConfig {
        try {
            const configPath = join('config', 'web-api.json');
            if (existsSync(configPath)) {
                const configData = readFileSync(configPath, 'utf8');
                return JSON.parse(configData) as WebApiConfig;
            }
        } catch (error) {
            logger.warn('Failed to load web API configuration, using defaults');
        }

        return {
            enabled: false,
            port: 43595,
            host: '0.0.0.0'
        };
    }

    private setupMiddleware() {
        // Enable CORS for web interface
        this.app.use(cors({
            origin: ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:43595'],
            credentials: true
        }));

        // Parse JSON bodies
        this.app.use(express.json());

        // Logging middleware
        this.app.use((req, res, next) => {
            logger.info(`[Web API] ${req.method} ${req.path}`);
            next();
        });
    }

    private setupRoutes() {
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok', blockchain: this.blockchainService.isEnabled() });
        });

        // Get blockchain configuration
        this.app.get('/api/crypto/config', (req, res) => {
            try {
                const contractAddress = process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
                const networkId = parseInt(process.env.NETWORK_ID || '80002');
                const rpcUrl = process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';
                
                res.json({
                    contractAddress,
                    networkId,
                    rpcUrl,
                    enabled: this.blockchainService.isEnabled()
                });
            } catch (error) {
                logger.error('Error fetching blockchain config:', error);
                res.status(500).json({ error: 'Failed to load configuration' });
            }
        });

        // Link wallet to game account
        this.app.post('/api/crypto/link', async (req, res) => {
            try {
                const { username, walletAddress, signature, message } = req.body;

                if (!username || !walletAddress || !signature) {
                    return res.status(400).json({ success: false, error: 'Missing required fields' });
                }

                // Verify the wallet signature
                const verified = await this.blockchainService.verifyWalletSignature(
                    walletAddress,
                    signature,
                    message
                );

                if (!verified) {
                    return res.status(400).json({ success: false, error: 'Invalid signature' });
                }

                // Load player save
                const playerSave = loadPlayerSave(username);
                if (!playerSave) {
                    return res.status(404).json({ success: false, error: 'Player not found' });
                }

                // Update player save with wallet info
                playerSave.cryptoWallet = {
                    address: walletAddress,
                    linkedAt: new Date(),
                    verified: true
                };

                // Save updated player data
                const saved = savePlayerSaveData(playerSave);
                if (!saved) {
                    return res.status(500).json({ success: false, error: 'Failed to save player data' });
                }

                logger.info(`Wallet ${walletAddress} linked to account ${username}`);

                res.json({ success: true });

            } catch (error) {
                logger.error('Error linking wallet:', error);
                res.status(500).json({ success: false, error: 'Internal server error' });
            }
        });

        // Process deposit
        this.app.post('/api/crypto/deposit', async (req, res) => {
            try {
                const { username, walletAddress, amount, txHash, balanceVerified } = req.body;

                logger.info(`[DEPOSIT] Request received - username: ${username}, wallet: ${walletAddress}, amount: ${amount}, txHash: ${txHash}, balanceVerified: ${balanceVerified}`);

                if (!username || !walletAddress || !amount || !txHash) {
                    logger.warn(`[DEPOSIT] Missing required fields`);
                    return res.status(400).json({ success: false, error: 'Missing required fields' });
                }

                // Parse amount as number to ensure it's not a string
                const depositAmount = typeof amount === 'string' ? parseInt(amount, 10) : amount;
                if (isNaN(depositAmount) || depositAmount <= 0) {
                    logger.warn(`[DEPOSIT] Invalid amount: ${amount}`);
                    return res.status(400).json({ success: false, error: 'Invalid deposit amount' });
                }

                // Load player save
                const playerSave = loadPlayerSave(username);
                if (!playerSave) {
                    logger.warn(`[DEPOSIT] Player not found: ${username}`);
                    return res.status(404).json({ success: false, error: 'Player not found. Please log into the game at least once to create your account.' });
                }

                logger.info(`[DEPOSIT] Player save loaded successfully for ${username}`);

                // Verify wallet matches (case-insensitive)
                if (playerSave.cryptoWallet?.address?.toLowerCase() !== walletAddress.toLowerCase()) {
                    logger.warn(`[DEPOSIT] Wallet mismatch - save: ${playerSave.cryptoWallet?.address}, request: ${walletAddress}`);
                    return res.status(403).json({ success: false, error: 'Wallet not linked to this account' });
                }

                logger.info(`[DEPOSIT] Wallet verified for ${username}`);

                // Verify the blockchain transaction and add gold as Coins item
                // TODO: In production, verify the transaction on the blockchain
                
                // Initialize inventory if it doesn't exist
                if (!playerSave.inventory) {
                    logger.info(`[DEPOSIT] Initializing empty inventory for ${username}`);
                    playerSave.inventory = [];
                }

                // Log inventory state before deposit
                const coinsBefore = playerSave.inventory.filter(item => item && item.itemId === COINS_ITEM_ID)
                    .reduce((sum, item) => sum + (item.amount || 0), 0);
                logger.info(`[DEPOSIT] Inventory before deposit - Coins: ${coinsBefore}, Total items: ${playerSave.inventory.length}`);

                // Find existing coins in inventory or add new stack
                let coinsSlot = -1;
                for (let i = 0; i < playerSave.inventory.length; i++) {
                    if (playerSave.inventory[i] && playerSave.inventory[i].itemId === COINS_ITEM_ID) {
                        coinsSlot = i;
                        logger.info(`[DEPOSIT] Found existing coins at slot ${i}, current amount: ${playerSave.inventory[i].amount}`);
                        break;
                    }
                }

                if (coinsSlot >= 0) {
                    // Add to existing coins stack
                    const oldAmount = playerSave.inventory[coinsSlot].amount || 0;
                    playerSave.inventory[coinsSlot].amount = oldAmount + depositAmount;
                    logger.info(`[DEPOSIT] Updated existing coins stack: ${oldAmount} + ${depositAmount} = ${playerSave.inventory[coinsSlot].amount}`);
                } else {
                    // Find first empty slot or add to end
                    let emptySlot = -1;
                    for (let i = 0; i < playerSave.inventory.length; i++) {
                        if (!playerSave.inventory[i] || playerSave.inventory[i] === null) {
                            emptySlot = i;
                            break;
                        }
                    }
                    
                    const coinsItem = {
                        itemId: COINS_ITEM_ID,
                        amount: depositAmount
                    };
                    
                    if (emptySlot >= 0) {
                        playerSave.inventory[emptySlot] = coinsItem;
                        logger.info(`[DEPOSIT] Added new coins stack at empty slot ${emptySlot}, amount: ${depositAmount}`);
                    } else {
                        playerSave.inventory.push(coinsItem);
                        logger.info(`[DEPOSIT] Added new coins stack at end (slot ${playerSave.inventory.length - 1}), amount: ${depositAmount}`);
                    }
                }

                // Calculate new total
                let totalCoins = 0;
                for (const item of playerSave.inventory) {
                    if (item && item.itemId === COINS_ITEM_ID) {
                        totalCoins += item.amount || 0;
                    }
                }

                logger.info(`[DEPOSIT] Inventory after deposit - Total coins: ${totalCoins}`);

                // Save updated player data
                const saved = savePlayerSaveData(playerSave);
                if (!saved) {
                    logger.error(`[DEPOSIT] Failed to save player data for ${username}`);
                    return res.status(500).json({ success: false, error: 'Failed to save player data' });
                }

                logger.info(`[DEPOSIT] SUCCESS - Deposited ${depositAmount} gold (Coins item ID ${COINS_ITEM_ID}) for player ${username}, new total: ${totalCoins}, tx: ${txHash}`);

                res.json({ success: true, goldBalance: totalCoins, deposited: depositAmount });

            } catch (error) {
                logger.error('[DEPOSIT] Error processing deposit:', error);
                res.status(500).json({ success: false, error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) });
            }
        });

        // Process withdrawal
        this.app.post('/api/crypto/withdraw', async (req, res) => {
            try {
                const { username, walletAddress, amount } = req.body;

                if (!username || !walletAddress || !amount) {
                    return res.status(400).json({ success: false, error: 'Missing required fields' });
                }

                // Validate amount
                if (amount < 1000 || amount > 1000000) {
                    return res.status(400).json({ success: false, error: 'Amount must be between 1,000 and 1,000,000' });
                }

                // Load player save
                const playerSave = loadPlayerSave(username);
                if (!playerSave) {
                    return res.status(404).json({ success: false, error: 'Player not found' });
                }

                // Verify wallet matches (case-insensitive)
                if (playerSave.cryptoWallet?.address?.toLowerCase() !== walletAddress.toLowerCase()) {
                    return res.status(403).json({ success: false, error: 'Wallet not linked to this account' });
                }

                // Check sufficient balance by counting Coins (ID 995) in inventory
                let totalCoins = 0;
                const coinSlots = [];
                
                if (!playerSave.inventory) {
                    return res.status(400).json({ success: false, error: 'Insufficient gold balance' });
                }

                for (let i = 0; i < playerSave.inventory.length; i++) {
                    if (playerSave.inventory[i] && playerSave.inventory[i].itemId === COINS_ITEM_ID) {
                        totalCoins += playerSave.inventory[i].amount || 0;
                        coinSlots.push(i);
                    }
                }

                if (totalCoins < amount) {
                    return res.status(400).json({ success: false, error: 'Insufficient gold balance' });
                }

                // Deduct coins from inventory
                // TODO: In production, initiate actual blockchain transaction
                let remaining = amount;
                for (const slot of coinSlots) {
                    if (remaining <= 0) break;
                    
                    const itemAmount = playerSave.inventory[slot].amount || 0;
                    if (itemAmount <= remaining) {
                        remaining -= itemAmount;
                        playerSave.inventory[slot] = null; // Remove entire stack
                    } else {
                        playerSave.inventory[slot].amount = itemAmount - remaining;
                        remaining = 0;
                    }
                }

                // Calculate new total
                let newTotal = 0;
                for (const item of playerSave.inventory) {
                    if (item && item.itemId === COINS_ITEM_ID) {
                        newTotal += item.amount || 0;
                    }
                }

                // Save updated player data
                const saved = savePlayerSaveData(playerSave);
                if (!saved) {
                    return res.status(500).json({ success: false, error: 'Failed to save player data' });
                }

                const mockTxHash = `0x${Date.now().toString(16)}...`;
                logger.info(`Withdrawal of ${amount} gold (Coins item) initiated for player ${username}, new total: ${newTotal}`);

                res.json({ success: true, txHash: mockTxHash, goldBalance: newTotal });

            } catch (error) {
                logger.error('Error processing withdrawal:', error);
                res.status(500).json({ success: false, error: 'Internal server error' });
            }
        });

        // Check if account is linked
        this.app.get('/api/crypto/check-link', async (req, res) => {
            try {
                const { username, walletAddress } = req.query;

                if (!username || !walletAddress) {
                    return res.status(400).json({ success: false, error: 'Username and wallet address required' });
                }

                // Load player save
                const playerSave = loadPlayerSave(username as string);
                if (!playerSave) {
                    return res.status(404).json({ success: false, error: 'Player not found' });
                }

                // Check if wallet is linked
                const isLinked = playerSave.cryptoWallet?.address?.toLowerCase() === (walletAddress as string).toLowerCase();

                res.json({
                    success: true,
                    isLinked: isLinked,
                    walletAddress: playerSave.cryptoWallet?.address
                });

            } catch (error) {
                logger.error('Error checking link status:', error);
                res.status(500).json({ success: false, error: 'Internal server error' });
            }
        });

        // Get balance
        this.app.get('/api/crypto/balance', async (req, res) => {
            try {
                const { username } = req.query;

                if (!username) {
                    return res.status(400).json({ success: false, error: 'Username required' });
                }

                // Load player save
                const playerSave = loadPlayerSave(username as string);
                if (!playerSave) {
                    logger.warn(`[BALANCE] Player not found: ${username}`);
                    return res.status(404).json({ success: false, error: 'Player not found' });
                }

                // Calculate total coins from inventory
                let coinsInInventory = 0;
                const coinStacks = [];
                if (playerSave.inventory) {
                    for (let i = 0; i < playerSave.inventory.length; i++) {
                        const item = playerSave.inventory[i];
                        if (item && item.itemId === COINS_ITEM_ID) {
                            coinsInInventory += item.amount || 0;
                            coinStacks.push({ slot: i, amount: item.amount });
                        }
                    }
                }

                logger.info(`[BALANCE] Player ${username} - Total coins: ${coinsInInventory}, Coin stacks: ${JSON.stringify(coinStacks)}, Inventory length: ${playerSave.inventory?.length || 0}`);

                res.json({
                    success: true,
                    goldBalance: coinsInInventory,
                    walletAddress: playerSave.cryptoWallet?.address,
                    isLinked: !!playerSave.cryptoWallet?.address
                });

            } catch (error) {
                logger.error('[BALANCE] Error getting balance:', error);
                res.status(500).json({ success: false, error: 'Internal server error' });
            }
        });

        // Serve static files
        this.app.use(express.static(join(process.cwd(), 'web', 'public')));

        // Serve web app on root
        this.app.get('/', (req, res) => {
            res.sendFile(join(process.cwd(), 'web', 'public', 'index.html'));
        });
    }

    public async start(): Promise<boolean> {
        if (!this.config.enabled) {
            logger.info('Web API server is disabled');
            return false;
        }

        return new Promise((resolve) => {
            this.app.listen(this.config.port, this.config.host, () => {
                logger.info(`Web API Server listening @ ${this.config.host}:${this.config.port}`);
                logger.info(`Open http://localhost:${this.config.port} in your browser to access the wallet interface`);
                resolve(true);
            });
        });
    }
}

// Export singleton instance
let webApiServerInstance: WebApiServer | null = null;

export function getWebApiServer(): WebApiServer {
    if (!webApiServerInstance) {
        webApiServerInstance = new WebApiServer();
    }
    return webApiServerInstance;
}

export function launchWebApiServer(): void {
    const server = getWebApiServer();
    server.start();
}
