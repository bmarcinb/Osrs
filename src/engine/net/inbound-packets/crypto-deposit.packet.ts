/**
 * Packet handler for crypto token deposit requests
 * Allows players to deposit ERC-20 tokens and receive in-game gold
 */

import type { PacketData } from '@engine/net/inbound-packet-handler';
import type { Player } from '@engine/world/actor/player/player';
import { getBlockchainService } from '@engine/world/economy/blockchain-service';
import { logger } from '@runejs/common';

const cryptoDepositPacket = async (player: Player, packet: PacketData) => {
    try {
        // Read amount and transaction hash from packet
        const amount = packet.buffer.get('INT');
        const txHash = packet.buffer.getString();

        if (!txHash || amount <= 0) {
            player.sendMessage('Invalid deposit request.');
            return;
        }

        logger.info(`Player ${player.username} attempting to deposit ${amount} tokens, tx: ${txHash}`);

        // Get blockchain service
        const blockchainService = getBlockchainService();

        if (!blockchainService.isEnabled()) {
            player.sendMessage('Cryptocurrency features are currently disabled.');
            return;
        }

        // Check if player has linked wallet
        if (!player.cryptoWallet || !player.cryptoWallet.verified) {
            player.sendMessage('You must link a wallet before depositing tokens.');
            return;
        }

        player.sendMessage('Processing deposit... This may take a moment.');

        // Process the deposit
        const success = await blockchainService.depositTokens(player, amount, txHash);

        if (success) {
            player.sendMessage(`Successfully deposited ${amount} tokens! Gold added to your balance.`);
            logger.info(`Player ${player.username} successfully deposited ${amount} tokens`);
        } else {
            player.sendMessage('Failed to process deposit. Please verify the transaction and try again.');
            logger.warn(`Player ${player.username} failed to deposit ${amount} tokens`);
        }
    } catch (error) {
        logger.error('Error processing deposit packet:', error);
        player.sendMessage('An error occurred while processing your deposit.');
    }
};

export default [
    {
        opcode: 201, // Placeholder opcode - adjust based on available opcodes
        size: -1,
        handler: cryptoDepositPacket,
    },
];
