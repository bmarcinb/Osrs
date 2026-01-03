/**
 * Packet handler for crypto balance synchronization requests
 * Allows players to check and sync their blockchain and in-game balances
 */

import type { PacketData } from '@engine/net/inbound-packet-handler';
import type { Player } from '@engine/world/actor/player/player';
import { getBlockchainService } from '@engine/world/economy/blockchain-service';
import { logger } from '@runejs/common';

const cryptoBalanceSyncPacket = async (player: Player, packet: PacketData) => {
    try {
        logger.info(`Player ${player.username} requesting balance sync`);

        // Get blockchain service
        const blockchainService = getBlockchainService();

        if (!blockchainService.isEnabled()) {
            player.sendMessage('Cryptocurrency features are currently disabled.');
            return;
        }

        // Check if player has linked wallet
        if (!player.cryptoWallet || !player.cryptoWallet.verified) {
            player.sendMessage('You must link a wallet to check blockchain balance.');
            return;
        }

        // Get in-game gold balance
        const goldBalance = player.getGold();

        // Get blockchain token balance
        const blockchainBalance = await blockchainService.getBlockchainBalance(
            player.cryptoWallet.address
        );

        // Sync balance
        await blockchainService.syncBalance(player);

        // Send balance information to player
        player.sendMessage('=== Balance Information ===');
        player.sendMessage(`In-game Gold: ${goldBalance}`);
        player.sendMessage(`Wallet Tokens: ${blockchainBalance}`);
        player.sendMessage(`Wallet Address: ${player.cryptoWallet.address.substring(0, 10)}...`);

        logger.info(
            `Player ${player.username} balance - Gold: ${goldBalance}, Tokens: ${blockchainBalance}`
        );
    } catch (error) {
        logger.error('Error processing balance sync packet:', error);
        player.sendMessage('An error occurred while syncing your balance.');
    }
};

export default [
    {
        opcode: 203, // Placeholder opcode - adjust based on available opcodes
        size: 0, // No data needed
        handler: cryptoBalanceSyncPacket,
    },
];
