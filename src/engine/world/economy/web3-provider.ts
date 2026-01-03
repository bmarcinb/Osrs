/**
 * Web3 Provider for Polygon network interaction
 * Handles blockchain connection and contract initialization
 */

import { ethers } from 'ethers';
import { logger } from '@runejs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface BlockchainConfig {
    enabled: boolean;
    network: string;
    rpcUrl: string;
    contractAddress: string;
    privateKey: string;
    gasLimit: number;
    confirmations: number;
    withdrawalCooldown: number;
    minWithdrawal: number;
    maxWithdrawal: number;
}

/**
 * RuneGoldToken ABI (minimal interface for required functions)
 */
const RUNE_GOLD_TOKEN_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function linkGameAccount(bytes32 gameAccountHash)',
    'function deposit(uint256 amount)',
    'function withdraw(uint256 amount)',
    'function isLinked(address wallet) view returns (bool)',
    'function getGameAccountHash(address wallet) view returns (bytes32)',
    'function getWithdrawalCooldownRemaining(address wallet) view returns (uint256)',
    'event GameAccountLinked(address indexed wallet, bytes32 indexed gameAccountHash)',
    'event TokensDeposited(address indexed wallet, uint256 amount)',
    'event TokensWithdrawn(address indexed wallet, uint256 amount)',
];

export class Web3Provider {
    private provider: ethers.JsonRpcProvider | null = null;
    private wallet: ethers.Wallet | null = null;
    private contract: ethers.Contract | null = null;
    private config: BlockchainConfig;

    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * Load blockchain configuration from file
     */
    private loadConfig(): BlockchainConfig {
        try {
            const configPath = join('config', 'blockchain.json');
            const configData = readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData) as BlockchainConfig;

            // Handle environment variable for private key
            if (config.privateKey && config.privateKey.startsWith('env:')) {
                const envVar = config.privateKey.substring(4);
                config.privateKey = process.env[envVar] || '';
            }

            return config;
        } catch (error) {
            logger.error('Failed to load blockchain configuration:', error);
            return {
                enabled: false,
                network: 'polygon',
                rpcUrl: '',
                contractAddress: '',
                privateKey: '',
                gasLimit: 100000,
                confirmations: 12,
                withdrawalCooldown: 300,
                minWithdrawal: 1000,
                maxWithdrawal: 1000000,
            };
        }
    }

    /**
     * Initialize the Web3 provider and connect to the blockchain
     */
    public async initialize(): Promise<boolean> {
        if (!this.config.enabled) {
            logger.info('Blockchain integration is disabled');
            return false;
        }

        try {
            // Initialize provider
            this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);

            // Initialize wallet
            if (this.config.privateKey) {
                this.wallet = new ethers.Wallet(this.config.privateKey, this.provider);
            }

            // Initialize contract
            if (this.wallet && this.config.contractAddress) {
                this.contract = new ethers.Contract(
                    this.config.contractAddress,
                    RUNE_GOLD_TOKEN_ABI,
                    this.wallet
                );

                // Test connection
                const name = await this.contract.name();
                logger.info(`Connected to RuneGoldToken contract: ${name}`);
            }

            return true;
        } catch (error) {
            logger.error('Failed to initialize Web3 provider:', error);
            return false;
        }
    }

    /**
     * Check if the provider is initialized and enabled
     */
    public isEnabled(): boolean {
        return this.config.enabled && this.provider !== null;
    }

    /**
     * Get the contract instance
     */
    public getContract(): ethers.Contract | null {
        return this.contract;
    }

    /**
     * Get the provider instance
     */
    public getProvider(): ethers.JsonRpcProvider | null {
        return this.provider;
    }

    /**
     * Get the wallet instance
     */
    public getWallet(): ethers.Wallet | null {
        return this.wallet;
    }

    /**
     * Get blockchain configuration
     */
    public getConfig(): BlockchainConfig {
        return this.config;
    }

    /**
     * Get token balance for an address
     */
    public async getBalance(address: string): Promise<number> {
        if (!this.contract) {
            throw new Error('Contract not initialized');
        }

        try {
            const balance = await this.contract.balanceOf(address);
            return Number(balance);
        } catch (error) {
            logger.error(`Failed to get balance for ${address}:`, error);
            return 0;
        }
    }

    /**
     * Check if a wallet is linked to a game account
     */
    public async isLinked(address: string): Promise<boolean> {
        if (!this.contract) {
            throw new Error('Contract not initialized');
        }

        try {
            return await this.contract.isLinked(address);
        } catch (error) {
            logger.error(`Failed to check if wallet ${address} is linked:`, error);
            return false;
        }
    }

    /**
     * Get game account hash for a wallet
     */
    public async getGameAccountHash(address: string): Promise<string> {
        if (!this.contract) {
            throw new Error('Contract not initialized');
        }

        try {
            const hash = await this.contract.getGameAccountHash(address);
            return hash;
        } catch (error) {
            logger.error(`Failed to get game account hash for ${address}:`, error);
            return '0x0000000000000000000000000000000000000000000000000000000000000000';
        }
    }

    /**
     * Get withdrawal cooldown remaining for a wallet
     */
    public async getWithdrawalCooldownRemaining(address: string): Promise<number> {
        if (!this.contract) {
            throw new Error('Contract not initialized');
        }

        try {
            const remaining = await this.contract.getWithdrawalCooldownRemaining(address);
            return Number(remaining);
        } catch (error) {
            logger.error(`Failed to get withdrawal cooldown for ${address}:`, error);
            return 0;
        }
    }

    /**
     * Wait for transaction confirmation
     */
    public async waitForTransaction(txHash: string): Promise<ethers.TransactionReceipt | null> {
        if (!this.provider) {
            throw new Error('Provider not initialized');
        }

        try {
            const receipt = await this.provider.waitForTransaction(txHash, this.config.confirmations);
            return receipt;
        } catch (error) {
            logger.error(`Failed to wait for transaction ${txHash}:`, error);
            return null;
        }
    }

    /**
     * Get transaction by hash
     */
    public async getTransaction(txHash: string): Promise<ethers.TransactionResponse | null> {
        if (!this.provider) {
            throw new Error('Provider not initialized');
        }

        try {
            return await this.provider.getTransaction(txHash);
        } catch (error) {
            logger.error(`Failed to get transaction ${txHash}:`, error);
            return null;
        }
    }
}

// Singleton instance
let web3ProviderInstance: Web3Provider | null = null;

/**
 * Get the singleton Web3Provider instance
 */
export function getWeb3Provider(): Web3Provider {
    if (!web3ProviderInstance) {
        web3ProviderInstance = new Web3Provider();
    }
    return web3ProviderInstance;
}
