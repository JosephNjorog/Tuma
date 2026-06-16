// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./UserOperation.sol";

interface IAggregator {
    function validateSignatures(UserOperation[] calldata userOps, bytes calldata signature) external view;
    function validateUserOpSignature(UserOperation calldata userOp) external view returns (bytes memory sigForUserOp);
    function aggregateSignatures(UserOperation[] calldata userOps) external view returns (bytes memory aggregatedSignature);
}

interface IEntryPoint {
    /**
     * Execute a batch of UserOperations.
     * No signature aggregator is used.
     */
    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external;

    /**
     * Execute a batch of UserOperations with a single aggregator.
     */
    function handleAggregatedOps(
        UserOpsPerAggregator[] calldata opsPerAggregator,
        address payable beneficiary
    ) external;

    /**
     * Simulate a UserOperation — reverts with ValidationResult.
     */
    function simulateValidation(UserOperation calldata userOp) external;

    /**
     * Get the nonce for a sender/key combination.
     */
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);

    /**
     * Deposit ETH/AVAX to an account's stake in the EntryPoint.
     */
    function depositTo(address account) external payable;

    /**
     * Get the deposit balance for an account.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * Withdraw from the EntryPoint deposit.
     */
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;

    /**
     * Add stake with a delay.
     */
    function addStake(uint32 unstakeDelaySec) external payable;

    /**
     * Unlock stake (starts the unstake delay).
     */
    function unlockStake() external;

    /**
     * Withdraw staked funds after unlock delay.
     */
    function withdrawStake(address payable withdrawAddress) external;

    struct UserOpsPerAggregator {
        UserOperation[] userOps;
        IAggregator aggregator;
        bytes signature;
    }
}
