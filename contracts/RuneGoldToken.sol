// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RuneGoldToken (RGP)
 * @dev ERC-20 token that backs in-game gold 1:1 on Polygon network
 * 
 * This smart contract implements an ERC-20 token with game-specific functionality:
 * - Players can link their wallet to a game account (hashed for privacy)
 * - Players can deposit tokens to convert to in-game gold
 * - Players can withdraw in-game gold as tokens
 * - Emergency pause functionality for security
 * - Rate limiting on withdrawals to prevent exploits
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RuneGoldToken is ERC20, Pausable, ReentrancyGuard, Ownable {
    
    // Mapping from wallet address to game account hash
    mapping(address => bytes32) private _gameAccounts;
    
    // Mapping from wallet to last withdrawal timestamp
    mapping(address => uint256) private _lastWithdrawal;
    
    // Withdrawal cooldown period in seconds (default: 5 minutes)
    uint256 public withdrawalCooldown = 300;
    
    // Minimum withdrawal amount (default: 1000 gold)
    uint256 public minWithdrawal = 1000;
    
    // Maximum withdrawal amount (default: 1,000,000 gold)
    uint256 public maxWithdrawal = 1000000;
    
    // Events
    event GameAccountLinked(address indexed wallet, bytes32 indexed gameAccountHash);
    event TokensDeposited(address indexed wallet, uint256 amount);
    event TokensWithdrawn(address indexed wallet, uint256 amount);
    event WithdrawalLimitsUpdated(uint256 minWithdrawal, uint256 maxWithdrawal);
    event CooldownUpdated(uint256 newCooldown);
    
    /**
     * @dev Constructor that mints initial supply to contract owner
     * @param initialSupply Initial token supply (without decimals)
     */
    constructor(uint256 initialSupply) ERC20("RuneGold", "RGP") {
        // Mint initial supply to contract deployer
        _mint(msg.sender, initialSupply);
    }
    
    /**
     * @dev Returns the number of decimals (0 since 1 token = 1 gold)
     */
    function decimals() public pure override returns (uint8) {
        return 0;
    }
    
    /**
     * @dev Link wallet to a game account (hashed for privacy)
     * @param gameAccountHash Keccak256 hash of the game account identifier
     */
    function linkGameAccount(bytes32 gameAccountHash) external whenNotPaused {
        require(gameAccountHash != bytes32(0), "Invalid game account hash");
        require(_gameAccounts[msg.sender] == bytes32(0), "Wallet already linked");
        
        _gameAccounts[msg.sender] = gameAccountHash;
        emit GameAccountLinked(msg.sender, gameAccountHash);
    }
    
    /**
     * @dev Deposit tokens to convert to in-game gold
     * @param amount Amount of tokens to deposit
     */
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(_gameAccounts[msg.sender] != bytes32(0), "Wallet not linked to game account");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        // Transfer tokens to contract (held in escrow)
        _transfer(msg.sender, address(this), amount);
        
        emit TokensDeposited(msg.sender, amount);
    }
    
    /**
     * @dev Withdraw in-game gold as tokens
     * @param amount Amount of tokens to withdraw
     */
    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(_gameAccounts[msg.sender] != bytes32(0), "Wallet not linked to game account");
        require(amount >= minWithdrawal, "Amount below minimum withdrawal");
        require(amount <= maxWithdrawal, "Amount exceeds maximum withdrawal");
        
        // Check cooldown
        require(
            block.timestamp >= _lastWithdrawal[msg.sender] + withdrawalCooldown,
            "Withdrawal cooldown not met"
        );
        
        // Check contract has sufficient balance
        require(balanceOf(address(this)) >= amount, "Insufficient contract balance");
        
        // Update last withdrawal timestamp
        _lastWithdrawal[msg.sender] = block.timestamp;
        
        // Transfer tokens from contract to user
        _transfer(address(this), msg.sender, amount);
        
        emit TokensWithdrawn(msg.sender, amount);
    }
    
    /**
     * @dev Check if wallet is linked to a game account
     * @param wallet Address to check
     * @return bool True if wallet is linked
     */
    function isLinked(address wallet) external view returns (bool) {
        return _gameAccounts[wallet] != bytes32(0);
    }
    
    /**
     * @dev Get game account hash for a wallet
     * @param wallet Address to query
     * @return bytes32 Game account hash
     */
    function getGameAccountHash(address wallet) external view returns (bytes32) {
        return _gameAccounts[wallet];
    }
    
    /**
     * @dev Get time until next withdrawal is allowed
     * @param wallet Address to check
     * @return uint256 Seconds until withdrawal is allowed (0 if allowed now)
     */
    function getWithdrawalCooldownRemaining(address wallet) external view returns (uint256) {
        uint256 lastWithdrawal = _lastWithdrawal[wallet];
        uint256 nextAllowed = lastWithdrawal + withdrawalCooldown;
        
        if (block.timestamp >= nextAllowed) {
            return 0;
        }
        
        return nextAllowed - block.timestamp;
    }
    
    /**
     * @dev Update withdrawal limits (owner only)
     * @param _minWithdrawal New minimum withdrawal amount
     * @param _maxWithdrawal New maximum withdrawal amount
     */
    function setWithdrawalLimits(uint256 _minWithdrawal, uint256 _maxWithdrawal) external onlyOwner {
        require(_minWithdrawal > 0, "Min withdrawal must be greater than 0");
        require(_maxWithdrawal >= _minWithdrawal, "Max must be >= min");
        
        minWithdrawal = _minWithdrawal;
        maxWithdrawal = _maxWithdrawal;
        
        emit WithdrawalLimitsUpdated(_minWithdrawal, _maxWithdrawal);
    }
    
    /**
     * @dev Update withdrawal cooldown (owner only)
     * @param _cooldown New cooldown period in seconds
     */
    function setWithdrawalCooldown(uint256 _cooldown) external onlyOwner {
        require(_cooldown >= 60, "Cooldown must be at least 60 seconds");
        
        withdrawalCooldown = _cooldown;
        
        emit CooldownUpdated(_cooldown);
    }
    
    /**
     * @dev Pause contract (owner only, for emergencies)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Emergency token withdrawal (owner only, for critical situations)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(balanceOf(address(this)) >= amount, "Insufficient contract balance");
        _transfer(address(this), owner(), amount);
    }
}
