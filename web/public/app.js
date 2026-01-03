// RuneGold Wallet Web Interface
// Companion web app for cryptocurrency-backed economy

const API_BASE_URL = 'http://localhost:43595/api'; // Web API server endpoint

// Contract configuration will be loaded from server
let CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
let POLYGON_NETWORK_ID = 80002; // Default to Polygon Amoy Testnet

// Contract ABI (minimal interface)
const CONTRACT_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function deposit(uint256 amount)',
    'function withdraw(uint256 amount)',
    'function linkGameAccount(bytes32 gameAccountHash)',
    'function isLinked(address wallet) view returns (bool)',
    'function getGameAccountHash(address wallet) view returns (bytes32)'
];

class RuneGoldWallet {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.walletAddress = null;
        this.gameUsername = null;
        this.isLinked = false;
        this.configLoaded = false;
        
        this.init();
    }

    async init() {
        // Check if MetaMask is installed
        if (typeof window.ethereum === 'undefined') {
            this.showError('MetaMask is not installed. Please install MetaMask to use this feature.');
            document.getElementById('connectWalletBtn').disabled = true;
            return;
        }

        // Load blockchain configuration from server
        try {
            await this.loadBlockchainConfig();
        } catch (error) {
            console.error('Failed to load blockchain config:', error);
            this.showError('Failed to load blockchain configuration. Please ensure the web API server is running.');
            return;
        }

        // Setup event listeners
        this.setupEventListeners();

        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                this.disconnect();
            } else {
                this.walletAddress = accounts[0];
                this.updateUI();
            }
        });

        // Listen for network changes
        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
    }

    async loadBlockchainConfig() {
        try {
            const response = await fetch(`${API_BASE_URL}/crypto/config`);
            if (!response.ok) {
                throw new Error('Failed to fetch blockchain configuration');
            }
            
            const config = await response.json();
            CONTRACT_ADDRESS = config.contractAddress;
            POLYGON_NETWORK_ID = config.networkId;
            
            console.log('Loaded blockchain config:', {
                contractAddress: CONTRACT_ADDRESS,
                networkId: POLYGON_NETWORK_ID,
                enabled: config.enabled
            });
            
            if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
                this.showError('⚠️ Contract Not Configured\n\nThe RuneGoldToken contract address is not set in the server configuration (.env file).\n\nPlease:\n1. Deploy the contract to Polygon Amoy testnet\n2. Add CONTRACT_ADDRESS=0x... to your .env file\n3. Restart the web API server\n\nSee docs/CONTRACT_DEPLOYMENT.md for instructions.');
            }
            
            this.configLoaded = true;
        } catch (error) {
            console.error('Error loading blockchain config:', error);
            throw error;
        }
    }

    setupEventListeners() {
        document.getElementById('connectWalletBtn').addEventListener('click', () => this.connectWallet());
        document.getElementById('linkAccountBtn').addEventListener('click', () => this.linkAccount());
        document.getElementById('depositBtn').addEventListener('click', () => this.deposit());
        document.getElementById('withdrawBtn').addEventListener('click', () => this.withdraw());
        document.getElementById('refreshBalanceBtn').addEventListener('click', () => this.refreshBalance());
    }

    async connectWallet() {
        try {
            this.showLoading('Connecting to MetaMask...');

            // Ensure config is loaded
            if (!this.configLoaded) {
                this.showError('Configuration not loaded. Please refresh the page.');
                return;
            }

            // Check if contract address is configured
            if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
                this.showError('⚠️ Contract Not Deployed\n\nThe RuneGoldToken contract address is not configured in the server.\n\nPlease update the CONTRACT_ADDRESS in your .env file and restart the web API server.\n\nSee docs/CONTRACT_DEPLOYMENT.md for deployment instructions.');
                return;
            }

            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            this.walletAddress = accounts[0];

            // Initialize provider and signer
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();

            // Check network
            const network = await this.provider.getNetwork();
            if (network.chainId !== POLYGON_NETWORK_ID) {
                await this.switchToPolygon();
            }

            // Verify contract is deployed
            const code = await this.provider.getCode(CONTRACT_ADDRESS);
            if (code === '0x') {
                this.showError('⚠️ Contract Not Found\n\nNo contract deployed at: ' + CONTRACT_ADDRESS + '\n\nPlease verify:\n1. Contract is deployed to Polygon Amoy (Chain ID: ' + POLYGON_NETWORK_ID + ')\n2. CONTRACT_ADDRESS in .env is correct\n3. You are connected to the right network\n\nCurrent network: Chain ID ' + network.chainId);
                return;
            }

            // Initialize contract
            this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.signer);

            // Check if account was previously linked
            // Try to get username from local storage
            const savedUsername = localStorage.getItem('gameUsername');
            if (savedUsername) {
                this.gameUsername = savedUsername;
                this.isLinked = await this.checkIfLinked();
            }

            this.updateUI();
            this.showSuccess('Wallet connected successfully!');

            // If linked, load balance
            if (this.isLinked) {
                await this.refreshBalance();
            }

        } catch (error) {
            console.error('Error connecting wallet:', error);
            this.showError('Failed to connect wallet: ' + error.message);
        }
    }

    async switchToPolygon() {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x13882' }], // 80002 in hex (Amoy Testnet)
            });
        } catch (error) {
            // Network doesn't exist, add it
            if (error.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x13882',
                        chainName: 'Polygon Amoy Testnet',
                        nativeCurrency: {
                            name: 'MATIC',
                            symbol: 'MATIC',
                            decimals: 18
                        },
                        rpcUrls: ['https://rpc-amoy.polygon.technology'],
                        blockExplorerUrls: ['https://amoy.polygonscan.com']
                    }]
                });
            } else {
                throw error;
            }
        }
    }

    async checkIfLinked() {
        try {
            if (!this.contract) {
                return false;
            }
            return await this.contract.isLinked(this.walletAddress);
        } catch (error) {
            console.error('Error checking link status:', error);
            if (error.code === 'CALL_EXCEPTION') {
                this.showError('Unable to communicate with smart contract. Please ensure the contract is deployed correctly.');
            }
            return false;
        }
    }

    async linkAccount() {
        const username = document.getElementById('username').value.trim();
        
        if (!username) {
            this.showError('Please enter your game username');
            return;
        }

        // Check if wallet is connected and signer is initialized
        if (!this.signer || !this.walletAddress) {
            this.showError('Please connect your wallet first');
            return;
        }

        try {
            this.showLoading('Linking account...');

            // Generate signature for verification
            const message = `Link wallet to ${username} at ${Date.now()}`;
            const signature = await this.signer.signMessage(message);

            // Send link request to game server
            const response = await fetch(`${API_BASE_URL}/crypto/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    walletAddress: this.walletAddress,
                    signature,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                // Link on blockchain
                const gameAccountHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(username.toLowerCase()));
                const tx = await this.contract.linkGameAccount(gameAccountHash);
                await tx.wait();

                this.gameUsername = username;
                this.isLinked = true;
                localStorage.setItem('gameUsername', username); // Save for next time
                this.updateUI();
                this.showSuccess('Account linked successfully!');
                await this.refreshBalance();
            } else {
                this.showError(data.error || 'Failed to link account');
            }

        } catch (error) {
            console.error('Error linking account:', error);
            if (error.message.includes('Account is already linked')) {
                // Account is already linked on blockchain, update our state
                this.gameUsername = username;
                this.isLinked = true;
                localStorage.setItem('gameUsername', username);
                this.updateUI();
                this.showSuccess('Account already linked!');
                await this.refreshBalance();
            } else {
                this.showError('Failed to link account: ' + error.message);
            }
        }
    }

    async deposit() {
        const amount = parseInt(document.getElementById('depositAmount').value);

        if (!amount || amount <= 0) {
            this.showError('Please enter a valid amount');
            return;
        }

        // Check if wallet is connected and contract is initialized
        if (!this.contract || !this.walletAddress) {
            this.showError('Please connect your wallet first');
            return;
        }

        if (!this.gameUsername) {
            this.showError('Please link your game account first');
            return;
        }

        try {
            this.showLoading('Processing deposit...');

            // Execute deposit transaction on blockchain
            const tx = await this.contract.deposit(amount);
            this.showSuccess(`Transaction submitted! Hash: ${tx.hash.substring(0, 10)}...`);

            // Wait for confirmation
            const receipt = await tx.wait();

            // Notify game server
            const response = await fetch(`${API_BASE_URL}/crypto/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.gameUsername,
                    walletAddress: this.walletAddress,
                    amount,
                    txHash: tx.hash
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Successfully deposited ${amount} RGP to your in-game gold!`);
                await this.refreshBalance();
                document.getElementById('depositAmount').value = '';
            } else {
                this.showError(data.error || 'Failed to process deposit on game server');
            }

        } catch (error) {
            console.error('Error depositing:', error);
            this.showError('Failed to deposit: ' + error.message);
        }
    }

    async withdraw() {
        const amount = parseInt(document.getElementById('withdrawAmount').value);

        if (!amount || amount < 1000 || amount > 1000000) {
            this.showError('Amount must be between 1,000 and 1,000,000');
            return;
        }

        // Check if wallet is connected
        if (!this.walletAddress) {
            this.showError('Please connect your wallet first');
            return;
        }

        if (!this.gameUsername) {
            this.showError('Please link your game account first');
            return;
        }

        try {
            this.showLoading('Processing withdrawal...');

            // Request withdrawal from game server
            const response = await fetch(`${API_BASE_URL}/crypto/withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.gameUsername,
                    walletAddress: this.walletAddress,
                    amount
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Withdrawal initiated! Transaction: ${data.txHash.substring(0, 10)}...`);
                await this.refreshBalance();
                document.getElementById('withdrawAmount').value = '';
            } else {
                this.showError(data.error || 'Failed to process withdrawal');
            }

        } catch (error) {
            console.error('Error withdrawing:', error);
            this.showError('Failed to withdraw: ' + error.message);
        }
    }

    async refreshBalance() {
        // Check if wallet and contract are initialized
        if (!this.contract || !this.walletAddress || !this.gameUsername) {
            return;
        }

        try {
            // Get wallet balance
            const walletBalance = await this.contract.balanceOf(this.walletAddress);
            document.getElementById('walletBalance').textContent = walletBalance.toString();

            // Get in-game balance
            const response = await fetch(`${API_BASE_URL}/crypto/balance?username=${this.gameUsername}`);
            const data = await response.json();

            if (data.success) {
                document.getElementById('gameBalance').textContent = data.goldBalance;
            }

        } catch (error) {
            console.error('Error refreshing balance:', error);
        }
    }

    updateUI() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (this.walletAddress) {
            statusIndicator.classList.remove('disconnected');
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Wallet Connected';

            document.getElementById('walletConnected').classList.remove('hidden');
            document.getElementById('walletAddress').textContent = this.walletAddress;

            if (this.isLinked) {
                document.getElementById('linkSection').classList.add('hidden');
                document.getElementById('balanceSection').classList.remove('hidden');
                document.getElementById('depositSection').classList.remove('hidden');
                document.getElementById('withdrawSection').classList.remove('hidden');
            } else {
                document.getElementById('linkSection').classList.remove('hidden');
            }
        } else {
            statusIndicator.classList.add('disconnected');
            statusIndicator.classList.remove('connected');
            statusText.textContent = 'Not Connected';
        }
    }

    disconnect() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.walletAddress = null;
        this.gameUsername = null;
        this.isLinked = false;
        
        document.getElementById('walletConnected').classList.add('hidden');
        document.getElementById('linkSection').classList.add('hidden');
        document.getElementById('balanceSection').classList.add('hidden');
        document.getElementById('depositSection').classList.add('hidden');
        document.getElementById('withdrawSection').classList.add('hidden');
        
        this.updateUI();
    }

    showError(message) {
        const messageArea = document.getElementById('messageArea');
        messageArea.innerHTML = `<div class="error">${message}</div>`;
        setTimeout(() => { messageArea.innerHTML = ''; }, 5000);
    }

    showSuccess(message) {
        const messageArea = document.getElementById('messageArea');
        messageArea.innerHTML = `<div class="success">${message}</div>`;
        setTimeout(() => { messageArea.innerHTML = ''; }, 5000);
    }

    showLoading(message) {
        const messageArea = document.getElementById('messageArea');
        messageArea.innerHTML = `<div class="success"><span class="spinner"></span> ${message}</div>`;
    }
}

// Initialize the wallet when page loads
function initializeWallet() {
    // Check if ethers is loaded
    if (typeof ethers === 'undefined') {
        console.error('Ethers library not loaded, retrying...');
        // Retry after a short delay
        setTimeout(initializeWallet, 100);
        return;
    }
    
    console.log('Ethers library loaded, initializing wallet...');
    window.wallet = new RuneGoldWallet();
}

// Wait for DOM and try to initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWallet);
} else {
    // DOM already loaded
    initializeWallet();
}
