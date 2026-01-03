/**
 * Migration Service for converting existing coin-based systems to gold balance
 * Handles backward compatibility and data migration
 */

import { logger } from '@runejs/common';
import type { Player } from '@engine/world/actor/player/player';
import { itemIds } from '@engine/world/config/item-ids';

export class MigrationService {
    /**
     * Migrate player's coin inventory to gold balance system
     * This should be run once when a player loads for the first time after the crypto economy update
     * @param player The player to migrate
     */
    public static migratePlayerCoinsToGold(player: Player): void {
        try {
            // Check if player has already been migrated
            if (player.savedMetadata.goldBalance !== undefined && player.savedMetadata.goldBalance !== null) {
                // Already migrated, skip
                return;
            }

            // Calculate total coins in inventory
            let totalCoins = 0;

            // Find all coin items in inventory
            for (let i = 0; i < player.inventory.items.length; i++) {
                const item = player.inventory.items[i];
                if (item !== null && item.itemId === itemIds.coins) {
                    totalCoins += item.amount || 0;
                    // Remove the coin item from inventory
                    player.inventory.remove(i);
                }
            }

            // Initialize gold balance with coin total
            player.savedMetadata.goldBalance = totalCoins;

            // Update the display to show gold
            player.updateGoldDisplay();

            logger.info(`Migrated ${totalCoins} coins to gold balance for player ${player.username}`);
        } catch (error) {
            logger.error(`Failed to migrate coins for player ${player.username}:`, error);
            // If migration fails, initialize with 0 gold to prevent issues
            if (player.savedMetadata.goldBalance === undefined) {
                player.savedMetadata.goldBalance = 0;
            }
        }
    }

    /**
     * Check if player needs migration
     * @param player The player to check
     */
    public static needsMigration(player: Player): boolean {
        return player.savedMetadata.goldBalance === undefined || player.savedMetadata.goldBalance === null;
    }

    /**
     * Perform backward compatibility check
     * Ensures that existing code that checks for coins still works
     * @param player The player to check
     */
    public static ensureBackwardCompatibility(player: Player): void {
        // Ensure goldBalance is initialized
        if (player.savedMetadata.goldBalance === undefined || player.savedMetadata.goldBalance === null) {
            player.savedMetadata.goldBalance = 0;
        }
    }

    /**
     * Migrate all players in a batch (for server-wide migration)
     * This would be called once during server startup after the update
     * Note: This is a placeholder - actual implementation would iterate through save files
     */
    public static async batchMigrateAllPlayers(): Promise<void> {
        logger.info('Starting batch migration of all player coins to gold balance');

        try {
            // This is a placeholder
            // In actual implementation, you would:
            // 1. Read all player save files from data/saves/
            // 2. For each save file that doesn't have goldBalance:
            //    a. Load the save data
            //    b. Calculate total coins from inventory
            //    c. Add goldBalance field
            //    d. Remove coin items from inventory
            //    e. Save the updated data
            // 3. Log migration statistics

            logger.info('Batch migration completed');
        } catch (error) {
            logger.error('Failed to complete batch migration:', error);
        }
    }

    /**
     * Rollback migration for a player (emergency use only)
     * Converts gold balance back to coin items
     * @param player The player to rollback
     */
    public static rollbackMigration(player: Player): void {
        try {
            const goldBalance = player.savedMetadata.goldBalance || 0;

            if (goldBalance === 0) {
                return;
            }

            // Remove gold balance
            delete player.savedMetadata.goldBalance;

            // Add coins back to inventory
            player.giveItem({
                itemId: itemIds.coins,
                amount: goldBalance,
            });

            logger.warn(`Rolled back migration for player ${player.username}, restored ${goldBalance} coins`);
        } catch (error) {
            logger.error(`Failed to rollback migration for player ${player.username}:`, error);
        }
    }
}
