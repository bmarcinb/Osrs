/**
 * Blockchain Service for managing crypto wallet integration
 * Handles wallet linking, deposits, withdrawals, and balance synchronization
 */

import { logger } from '@runejs/common';
import { ethers } from 'ethers';
import type { Player } from '@engine/world/actor/player/player';
import type { CryptoWallet } from '@engine/world/actor/player/player-data';
import { getWeb3Provider } from './web3-provider';

export class BlockchainService {
    private web3Provider = getWeb3Provider();

    /**
     * Initialize the blockchain service
     */
    public async initialize(): Promise<boolean> {
        return await this.web3Provider.initialize();
    }

    /**
     * Check if blockchain integration is enabled
     */
    public isEnabled(): boolean {
        return this.web3Provider.isEnabled();
    }

    /**
     * Generate game account hash from player username
     */
    private generateGameAccountHash(username: string): string {
        return ethers.keccak256(ethers.toUtf8Bytes(username.toLowerCase()));
    }

    /**
     * Verify wallet ownership signature
     * @param walletAddress The wallet address to verify
     * @param signature The signature from the wallet
     * @param message The message that was signed
     */
    public async verifyWalletSignature(
        walletAddress: string,
        signature: string,
        message: string
    ): Promise<boolean> {
        try {
            const recoveredAddress = ethers.verifyMessage(message, signature);
            return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
        } catch (error) {
            logger.error('Failed to verify wallet signature:', error);
            return false;
        }
    }

    /**
     * Connect wallet to player account
     * @param player The player to link the wallet to
     * @param walletAddress The wallet address to link
     * @param signature The signature proving wallet ownership
     */
    public async connectWallet(
        player: Player,
        walletAddress: string,
        signature: string
    ): Promise<boolean> {
        if (!this.isEnabled()) {
            logger.warn('Blockchain integration is disabled');
            return false;
        }

        try {
            // Verify the wallet address is valid
            if (!ethers.isAddress(walletAddress)) {
                logger.warn(`Invalid wallet address: ${walletAddress}`);
                return false;
            }

            // Verify signature
            const message = `Link wallet to ${player.username} at ${Date.now()}`;
            const verified = await this.verifyWalletSignature(walletAddress, signature, message);

            if (!verified) {
                logger.warn(`Failed to verify signature for wallet ${walletAddress}`);
                return false;
            }

            // Check if wallet is already linked on-chain
            const isLinked = await this.web3Provider.isLinked(walletAddress);

            if (isLinked) {
                // Verify it's linked to this player's account
                const gameAccountHash = this.generateGameAccountHash(player.username);
                const onChainHash = await this.web3Provider.getGameAccountHash(walletAddress);

                if (onChainHash !== gameAccountHash) {
                    logger.warn(`Wallet ${walletAddress} is already linked to a different account`);
                    return false;
                }
            }

            // Store wallet information in player data
            player.cryptoWallet = {
                address: walletAddress,
                linkedAt: new Date(),
                verified: true,
            };

            logger.info(`Wallet ${walletAddress} linked to player ${player.username}`);
            return true;
        } catch (error) {
            logger.error('Failed to connect wallet:', error);
            return false;
        }
    }

    /**
     * Process token deposit and credit in-game gold
     * @param player The player depositing tokens
     * @param amount The amount of tokens to deposit
     * @param txHash The transaction hash on the blockchain
     */
    public async depositTokens(player: Player, amount: number, txHash: string): Promise<boolean> {
        if (!this.isEnabled()) {
            logger.warn('Blockchain integration is disabled');
            return false;
        }

        if (!player.cryptoWallet || !player.cryptoWallet.verified) {
            logger.warn(`Player ${player.username} does not have a verified wallet`);
            return false;
        }

        try {
            // Verify the transaction exists and is confirmed
            const tx = await this.web3Provider.getTransaction(txHash);

            if (!tx) {
                logger.warn(`Transaction ${txHash} not found`);
                return false;
            }

            // Wait for transaction confirmation
            const receipt = await this.web3Provider.waitForTransaction(txHash);

            if (!receipt || receipt.status !== 1) {
                logger.warn(`Transaction ${txHash} failed or not confirmed`);
                return false;
            }

            // Parse transaction logs to verify deposit event
            const contract = this.web3Provider.getContract();
            if (!contract) {
                logger.error('Contract not initialized');
                return false;
            }

            // Check for TokensDeposited event
            const depositEvent = receipt.logs
                .map(log => {
                    try {
                        return contract.interface.parseLog({
                            topics: [...log.topics],
                            data: log.data,
                        });
                    } catch {
                        return null;
                    }
                })
                .find(
                    event =>
                        event &&
                        event.name === 'TokensDeposited' &&
                        event.args[0].toLowerCase() === player.cryptoWallet?.address.toLowerCase()
                );

            if (!depositEvent) {
                logger.warn(`No deposit event found for ${player.username} in transaction ${txHash}`);
                return false;
            }

            const depositedAmount = Number(depositEvent.args[1]);

            if (depositedAmount !== amount) {
                logger.warn(`Deposit amount mismatch: expected ${amount}, got ${depositedAmount}`);
                return false;
            }

            // Credit in-game gold
            player.addGold(amount);

            logger.info(`Deposited ${amount} tokens for player ${player.username} from tx ${txHash}`);
            return true;
        } catch (error) {
            logger.error('Failed to process deposit:', error);
            return false;
        }
    }

    /**
     * Process withdrawal request and initiate blockchain transaction
     * @param player The player withdrawing tokens
     * @param amount The amount of tokens to withdraw
     */
    public async withdrawTokens(player: Player, amount: number): Promise<string | null> {
        if (!this.isEnabled()) {
            logger.warn('Blockchain integration is disabled');
            return null;
        }

        if (!player.cryptoWallet || !player.cryptoWallet.verified) {
            logger.warn(`Player ${player.username} does not have a verified wallet`);
            return null;
        }

        try {
            // Verify player has sufficient gold
            if (player.getGold() < amount) {
                logger.warn(`Player ${player.username} has insufficient gold for withdrawal`);
                return null;
            }

            // Check withdrawal limits
            const config = this.web3Provider.getConfig();

            if (amount < config.minWithdrawal || amount > config.maxWithdrawal) {
                logger.warn(`Withdrawal amount ${amount} is outside limits`);
                return null;
            }

            // Check cooldown
            const cooldownRemaining = await this.web3Provider.getWithdrawalCooldownRemaining(
                player.cryptoWallet.address
            );

            if (cooldownRemaining > 0) {
                logger.warn(
                    `Player ${player.username} must wait ${cooldownRemaining}s before next withdrawal`
                );
                return null;
            }

            // Deduct gold from player
            const removed = player.removeGold(amount);

            if (!removed) {
                logger.error(`Failed to deduct gold from player ${player.username}`);
                return null;
            }

            // Initiate blockchain withdrawal
            const contract = this.web3Provider.getContract();
            if (!contract) {
                // Refund gold if contract not available
                player.addGold(amount);
                logger.error('Contract not initialized');
                return null;
            }

            try {
                const tx = await contract.withdraw(amount);
                await tx.wait(1); // Wait for at least 1 confirmation

                logger.info(
                    `Withdrawal of ${amount} tokens initiated for player ${player.username}, tx: ${tx.hash}`
                );
                return tx.hash;
            } catch (contractError) {
                // Refund gold if withdrawal fails
                player.addGold(amount);
                logger.error('Failed to execute withdrawal transaction:', contractError);
                return null;
            }
        } catch (error) {
            logger.error('Failed to process withdrawal:', error);
            return null;
        }
    }

    /**
     * Get blockchain balance for a wallet address
     * @param walletAddress The wallet address to query
     */
    public async getBlockchainBalance(walletAddress: string): Promise<number> {
        if (!this.isEnabled()) {
            return 0;
        }

        try {
            return await this.web3Provider.getBalance(walletAddress);
        } catch (error) {
            logger.error('Failed to get blockchain balance:', error);
            return 0;
        }
    }

    /**
     * Synchronize player's internal gold balance with blockchain state
     * @param player The player to synchronize
     */
    public async syncBalance(player: Player): Promise<void> {
        if (!this.isEnabled()) {
            return;
        }

        if (!player.cryptoWallet || !player.cryptoWallet.verified) {
            return;
        }

        try {
            // This is a placeholder - in a real implementation, you would:
            // 1. Query the contract for pending deposits/withdrawals
            // 2. Reconcile any discrepancies between blockchain and internal state
            // 3. Update player's gold balance accordingly

            logger.info(`Synced balance for player ${player.username}`);
        } catch (error) {
            logger.error('Failed to sync balance:', error);
        }
    }
}

// Singleton instance
let blockchainServiceInstance: BlockchainService | null = null;

/**
 * Get the singleton BlockchainService instance
 */
export function getBlockchainService(): BlockchainService {
    if (!blockchainServiceInstance) {
        blockchainServiceInstance = new BlockchainService();
    }
    return blockchainServiceInstance;
}
