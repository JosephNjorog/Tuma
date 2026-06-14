// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TumaRegistry.sol";

contract TumaRegistryTest is Test {
    TumaRegistry public registry;

    address public admin  = makeAddr("admin");
    address public relayer = makeAddr("relayer");
    address public user1  = makeAddr("user1");
    address public user2  = makeAddr("user2");
    address public attacker = makeAddr("attacker");

    bytes32 constant PHONE_HASH_1 = keccak256("secret:+254712345678");
    bytes32 constant PHONE_HASH_2 = keccak256("secret:+233244567890");

    function setUp() public {
        registry = new TumaRegistry(admin, relayer);
    }

    // ── registerWallet ────────────────────────────────────────────────────────

    function test_registerWallet_success() public {
        vm.prank(relayer);
        registry.registerWallet(PHONE_HASH_1, user1);

        assertEq(registry.getWallet(PHONE_HASH_1), user1);
        assertEq(registry.getPhoneHash(user1), PHONE_HASH_1);
        assertTrue(registry.isRegistered(PHONE_HASH_1));
    }

    function test_registerWallet_emitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit TumaRegistry.WalletRegistered(PHONE_HASH_1, user1);

        vm.prank(relayer);
        registry.registerWallet(PHONE_HASH_1, user1);
    }

    function test_registerWallet_revertsOnDuplicate() public {
        vm.prank(relayer);
        registry.registerWallet(PHONE_HASH_1, user1);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TumaRegistry.AlreadyRegistered.selector, PHONE_HASH_1));
        registry.registerWallet(PHONE_HASH_1, user2); // same hash, different wallet
    }

    function test_registerWallet_revertsOnZeroAddress() public {
        vm.prank(relayer);
        vm.expectRevert(TumaRegistry.ZeroAddress.selector);
        registry.registerWallet(PHONE_HASH_1, address(0));
    }

    function test_registerWallet_revertsIfNotRelayer() public {
        vm.prank(attacker);
        vm.expectRevert(); // AccessControl reverts
        registry.registerWallet(PHONE_HASH_1, user1);
    }

    // ── updateWallet ──────────────────────────────────────────────────────────

    function test_updateWallet_success() public {
        vm.prank(relayer);
        registry.registerWallet(PHONE_HASH_1, user1);

        vm.prank(relayer);
        registry.updateWallet(PHONE_HASH_1, user2);

        assertEq(registry.getWallet(PHONE_HASH_1), user2);
        assertEq(registry.getPhoneHash(user2), PHONE_HASH_1);
        assertEq(registry.getPhoneHash(user1), bytes32(0)); // old mapping cleared
    }

    function test_updateWallet_revertsIfNotRegistered() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TumaRegistry.NotRegistered.selector, PHONE_HASH_1));
        registry.updateWallet(PHONE_HASH_1, user2);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    function test_isRegistered_falseByDefault() public view {
        assertFalse(registry.isRegistered(PHONE_HASH_1));
    }

    function test_getWallet_returnsZeroIfUnregistered() public view {
        assertEq(registry.getWallet(PHONE_HASH_1), address(0));
    }

    function test_batchGetWallets() public {
        vm.startPrank(relayer);
        registry.registerWallet(PHONE_HASH_1, user1);
        registry.registerWallet(PHONE_HASH_2, user2);
        vm.stopPrank();

        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = PHONE_HASH_1;
        hashes[1] = PHONE_HASH_2;

        address[] memory wallets = registry.batchGetWallets(hashes);
        assertEq(wallets[0], user1);
        assertEq(wallets[1], user2);
    }

    function test_batchGetWallets_returnsZeroForUnknown() public {
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = PHONE_HASH_1;

        address[] memory wallets = registry.batchGetWallets(hashes);
        assertEq(wallets[0], address(0));
    }

    // ── Access control ────────────────────────────────────────────────────────

    function test_adminCanGrantRelayerRole() public {
        address newRelayer = makeAddr("newRelayer");

        vm.prank(admin);
        registry.grantRole(registry.RELAYER_ROLE(), newRelayer);

        vm.prank(newRelayer);
        registry.registerWallet(PHONE_HASH_1, user1); // should succeed
    }

    function test_adminCanRevokeRelayerRole() public {
        vm.prank(admin);
        registry.revokeRole(registry.RELAYER_ROLE(), relayer);

        vm.prank(relayer);
        vm.expectRevert();
        registry.registerWallet(PHONE_HASH_1, user1);
    }
}
