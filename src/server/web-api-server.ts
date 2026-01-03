/**
 * Web API Server for Crypto Wallet Management
 * Provides HTTP API endpoints for the companion web interface
 */

import express from 'express';
import cors from 'cors';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@runejs/common';
import { getBlockchainService } from '@engine/world/economy/blockchain-service';
import { loadPlayerSave, savePlayerData } from '@engine/world/actor/player/player-data';

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
                // Note: This is a simplified version. In production, you'd want to do this through the game server
                // to ensure the player isn't currently logged in
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

                // Verify wallet matches
                if (playerSave.cryptoWallet?.address !== walletAddress) {
                    return res.status(403).json({ success: false, error: 'Wallet not linked to this account' });
                }

                // Note: In production, this should verify the blockchain transaction
                // and update the player's gold balance through the game server
                // For now, we'll update the saved gold balance
                playerSave.goldBalance = (playerSave.goldBalance || 0) + amount;

                logger.info(`Deposited ${amount} tokens for player ${username}, tx: ${txHash}`);

                res.json({ success: true, goldBalance: playerSave.goldBalance });

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

                // Verify wallet matches
                if (playerSave.cryptoWallet?.address !== walletAddress) {
                    return res.status(403).json({ success: false, error: 'Wallet not linked to this account' });
                }

                // Check sufficient balance
                const goldBalance = playerSave.goldBalance || 0;
                if (goldBalance < amount) {
                    return res.status(400).json({ success: false, error: 'Insufficient gold balance' });
                }

                // Note: In production, this should initiate a blockchain transaction
                // and deduct gold through the game server
                // For now, we'll simulate the response
                playerSave.goldBalance = goldBalance - amount;

                const mockTxHash = `0x${Date.now().toString(16)}...`;
                logger.info(`Withdrawal of ${amount} tokens initiated for player ${username}`);

                res.json({ success: true, txHash: mockTxHash, goldBalance: playerSave.goldBalance });

            } catch (error) {
                logger.error('Error processing withdrawal:', error);
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

                res.json({
                    success: true,
                    goldBalance: playerSave.goldBalance || 0,
                    walletAddress: playerSave.cryptoWallet?.address
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
