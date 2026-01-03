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
                const { username, walletAddress, amount, txHash } = req.body;

                if (!username || !walletAddress || !amount || !txHash) {
                    return res.status(400).json({ success: false, error: 'Missing required fields' });
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

                // Verify the blockchain transaction and add gold as Coins item (ID 995)
                // TODO: In production, verify the transaction on the blockchain
                
                // Initialize inventory if it doesn't exist
                if (!playerSave.inventory) {
                    playerSave.inventory = [];
                }

                // Find existing coins in inventory or add new stack
                let coinsSlot = -1;
                for (let i = 0; i < playerSave.inventory.length; i++) {
                    if (playerSave.inventory[i] && playerSave.inventory[i].itemId === 995) {
                        coinsSlot = i;
                        break;
                    }
                }

                if (coinsSlot >= 0) {
                    // Add to existing coins stack
                    playerSave.inventory[coinsSlot].amount = (playerSave.inventory[coinsSlot].amount || 0) + amount;
                } else {
                    // Find first empty slot or add to end
                    let emptySlot = -1;
                    for (let i = 0; i < playerSave.inventory.length; i++) {
                        if (!playerSave.inventory[i]) {
                            emptySlot = i;
                            break;
                        }
                    }
                    
                    const coinsItem = {
                        itemId: 995,
                        amount: amount
                    };
                    
                    if (emptySlot >= 0) {
                        playerSave.inventory[emptySlot] = coinsItem;
                    } else {
                        playerSave.inventory.push(coinsItem);
                    }
                }

                // Calculate new total
                let totalCoins = 0;
                for (const item of playerSave.inventory) {
                    if (item && item.itemId === 995) {
                        totalCoins += item.amount || 0;
                    }
                }

                // Save updated player data
                const saved = savePlayerSaveData(playerSave);
                if (!saved) {
                    return res.status(500).json({ success: false, error: 'Failed to save player data' });
                }

                logger.info(`Deposited ${amount} gold (Coins item) for player ${username}, new total: ${totalCoins}, tx: ${txHash}`);

                res.json({ success: true, goldBalance: totalCoins });

            } catch (error) {
                logger.error('Error processing deposit:', error);
                res.status(500).json({ success: false, error: 'Internal server error' });
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
                    if (playerSave.inventory[i] && playerSave.inventory[i].itemId === 995) {
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
                    if (item && item.itemId === 995) {
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
                    return res.status(404).json({ success: false, error: 'Player not found' });
                }

                // Calculate total coins from inventory
                let coinsInInventory = 0;
                if (playerSave.inventory) {
                    for (const item of playerSave.inventory) {
                        if (item && item.itemId === 995) { // Coins item ID
                            coinsInInventory += item.amount || 0;
                        }
                    }
                }

                res.json({
                    success: true,
                    goldBalance: coinsInInventory,
                    walletAddress: playerSave.cryptoWallet?.address,
                    isLinked: !!playerSave.cryptoWallet?.address
                });

            } catch (error) {
                logger.error('Error getting balance:', error);
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
