// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AutopayRegistry
 * @notice Maps hashed phone numbers to smart wallet addresses.
 *
 * The phone hash is keccak256(SECRET_SALT + phone) computed off-chain by the backend.
 * This preserves privacy — no raw phone number is ever stored on-chain.
 *
 * Only the RELAYER_ROLE (Autopayke backend) can register or update wallet addresses.
 * Anyone can look up a wallet address given a phone hash.
 */
contract AutopayRegistry is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice phone hash => wallet address
    mapping(bytes32 => address) private _wallets;

    /// @notice wallet address => phone hash (reverse lookup)
    mapping(address => bytes32) private _phoneHashes;

    // ── Events ────────────────────────────────────────────────────────────────

    event WalletRegistered(bytes32 indexed phoneHash, address indexed wallet);
    event WalletUpdated(bytes32 indexed phoneHash, address indexed oldWallet, address indexed newWallet);
    event WalletDeactivated(bytes32 indexed phoneHash, address indexed wallet);

    // ── Errors ────────────────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 phoneHash);
    error NotRegistered(bytes32 phoneHash);
    error ZeroAddress();

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param admin   Address that can grant/revoke roles.
     * @param relayer Autopayke backend relayer address (gets RELAYER_ROLE).
     */
    constructor(address admin, address relayer) {
        if (admin == address(0) || relayer == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * @notice Register a new wallet for a phone hash.
     * @dev Called by the relayer at user signup after wallet deployment.
     * @param phoneHash keccak256(SECRET_SALT + phone)
     * @param wallet    The deployed AutopaySmartWallet address
     */
    function registerWallet(bytes32 phoneHash, address wallet)
        external
        onlyRole(RELAYER_ROLE)
    {
        if (wallet == address(0)) revert ZeroAddress();
        if (_wallets[phoneHash] != address(0)) revert AlreadyRegistered(phoneHash);

        _wallets[phoneHash] = wallet;
        _phoneHashes[wallet] = phoneHash;

        emit WalletRegistered(phoneHash, wallet);
    }

    /**
     * @notice Update the wallet address for an existing phone hash.
     * @dev Used for wallet recovery or upgrade.
     */
    function updateWallet(bytes32 phoneHash, address newWallet)
        external
        onlyRole(RELAYER_ROLE)
    {
        if (newWallet == address(0)) revert ZeroAddress();
        address oldWallet = _wallets[phoneHash];
        if (oldWallet == address(0)) revert NotRegistered(phoneHash);

        // Clear reverse mapping for old wallet
        delete _phoneHashes[oldWallet];

        _wallets[phoneHash] = newWallet;
        _phoneHashes[newWallet] = phoneHash;

        emit WalletUpdated(phoneHash, oldWallet, newWallet);
    }

    /**
     * @notice Deactivate a wallet's registration (e.g., account closed, compromised
     *         wallet replaced and the old address should no longer resolve).
     * @dev Clears both directions of the mapping so getWallet/getPhoneHash/
     *      isRegistered all reflect the deactivation immediately.
     */
    function deactivateWallet(bytes32 phoneHash) external onlyRole(RELAYER_ROLE) {
        address wallet = _wallets[phoneHash];
        if (wallet == address(0)) revert NotRegistered(phoneHash);

        delete _wallets[phoneHash];
        delete _phoneHashes[wallet];

        emit WalletDeactivated(phoneHash, wallet);
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * @notice Look up a wallet address by phone hash.
     * @return wallet The wallet address, or address(0) if not registered.
     */
    function getWallet(bytes32 phoneHash) external view returns (address wallet) {
        return _wallets[phoneHash];
    }

    /**
     * @notice Reverse lookup: phone hash from a wallet address.
     */
    function getPhoneHash(address wallet) external view returns (bytes32) {
        return _phoneHashes[wallet];
    }

    /**
     * @notice Check if a phone hash is registered.
     */
    function isRegistered(bytes32 phoneHash) external view returns (bool) {
        return _wallets[phoneHash] != address(0);
    }

    /**
     * @notice Check if a wallet address currently has an active registration.
     *         Used by AutopayPaymaster to validate sponsorship requests
     *         instead of trusting the relayer's input blindly.
     */
    function isWalletRegistered(address wallet) external view returns (bool) {
        return _phoneHashes[wallet] != bytes32(0);
    }

    /**
     * @notice Batch lookup — resolve multiple phone hashes in one call.
     */
    function batchGetWallets(bytes32[] calldata phoneHashes)
        external
        view
        returns (address[] memory wallets)
    {
        wallets = new address[](phoneHashes.length);
        for (uint256 i = 0; i < phoneHashes.length; i++) {
            wallets[i] = _wallets[phoneHashes[i]];
        }
    }
}
