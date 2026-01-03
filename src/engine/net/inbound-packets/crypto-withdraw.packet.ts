/**
 * Packet handler for crypto token withdrawal requests
 * Allows players to withdraw in-game gold as ERC-20 tokens
 */

import type { PacketData } from '@engine/net/inbound-packet-handler';
import type { Player } from '@engine/world/actor/player/player';
import { getBlockchainService } from '@engine/world/economy/blockchain-service';
import { logger } from '@runejs/common';

const cryptoWithdrawPacket = async (player: Player, packet: PacketData) => {
    try {
        // Read withdrawal amount from packet
        const amount = packet.buffer.get('INT');

        if (amount <= 0) {
            player.sendMessage('Invalid withdrawal amount.');
            return;
        }

        logger.info(`Player ${player.username} attempting to withdraw ${amount} tokens`);

        // Get blockchain service
        const blockchainService = getBlockchainService();

        if (!blockchainService.isEnabled()) {
            player.sendMessage('Cryptocurrency features are currently disabled.');
            return;
        }

        // Check if player has linked wallet
        if (!player.cryptoWallet || !player.cryptoWallet.verified) {
            player.sendMessage('You must link a wallet before withdrawing tokens.');
            return;
        }

        // Check if player has sufficient gold
        if (player.getGold() < amount) {
            player.sendMessage('You do not have enough gold to withdraw that amount.');
            return;
        }

        player.sendMessage('Processing withdrawal... This may take a moment.');

        // Process the withdrawal
        const txHash = await blockchainService.withdrawTokens(player, amount);

        if (txHash) {
            player.sendMessage(`Successfully withdrew ${amount} tokens! Transaction: ${txHash.substring(0, 10)}...`);
            logger.info(`Player ${player.username} successfully withdrew ${amount} tokens, tx: ${txHash}`);
        } else {
            player.sendMessage('Failed to process withdrawal. Please check cooldown and limits.');
            logger.warn(`Player ${player.username} failed to withdraw ${amount} tokens`);
        }
    } catch (error) {
        logger.error('Error processing withdrawal packet:', error);
        player.sendMessage('An error occurred while processing your withdrawal.');
    }
};

export default [
    {
        opcode: 202, // Placeholder opcode - adjust based on available opcodes
        size: 4, // Size is fixed: 4 bytes for int32
        handler: cryptoWithdrawPacket,
    },
];
