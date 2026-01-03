/**
 * Packet handler for crypto wallet linking requests
 * Allows players to link their Ethereum/Polygon wallet to their game account
 */

import type { PacketData } from '@engine/net/inbound-packet-handler';
import type { Player } from '@engine/world/actor/player/player';
import { getBlockchainService } from '@engine/world/economy/blockchain-service';
import { logger } from '@runejs/common';

const cryptoWalletLinkPacket = async (player: Player, packet: PacketData) => {
    try {
        // Read wallet address and signature from packet
        const walletAddress = packet.buffer.getString();
        const signature = packet.buffer.getString();

        if (!walletAddress || !signature) {
            player.sendMessage('Invalid wallet linking request.');
            return;
        }

        logger.info(`Player ${player.username} attempting to link wallet ${walletAddress}`);

        // Get blockchain service
        const blockchainService = getBlockchainService();

        if (!blockchainService.isEnabled()) {
            player.sendMessage('Cryptocurrency features are currently disabled.');
            return;
        }

        // Attempt to connect wallet
        const success = await blockchainService.connectWallet(player, walletAddress, signature);

        if (success) {
            player.sendMessage('Wallet successfully linked to your account!');
            logger.info(`Player ${player.username} successfully linked wallet ${walletAddress}`);
        } else {
            player.sendMessage('Failed to link wallet. Please try again.');
            logger.warn(`Player ${player.username} failed to link wallet ${walletAddress}`);
        }
    } catch (error) {
        logger.error('Error processing wallet link packet:', error);
        player.sendMessage('An error occurred while linking your wallet.');
    }
};

export default [
    {
        opcode: 200, // Placeholder opcode - adjust based on available opcodes
        size: -1,
        handler: cryptoWalletLinkPacket,
    },
];
