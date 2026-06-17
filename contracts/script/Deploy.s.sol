// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AutopayRegistry.sol";
import "../src/AutopaySmartWallet.sol";
import "../src/AutopayWalletFactory.sol";
import "../src/AutopayEscrow.sol";
import "../src/AutopayPaymaster.sol";
import "../src/interfaces/IEntryPoint.sol";

/**
 * @title Deploy
 * @notice Full deployment script for all Autopayke contracts.
 *
 * Usage:
 *   # Testnet (Avalanche Fuji)
 *   forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify -vvvv
 *
 *   # Mainnet
 *   forge script script/Deploy.s.sol --rpc-url avalanche --broadcast --verify -vvvv
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY   Private key of the deploying wallet
 *   ADMIN_ADDRESS          Admin address (multisig in production)
 *   RELAYER_ADDRESS        Autopayke backend relayer EOA
 *   SIGNER_ADDRESS         Autopayke backend signer EOA (for escrow claim signatures)
 *   USDC_ADDRESS           USDC contract on the target network — allowed in AutopayEscrow from deploy
 *   USDT_ADDRESS           Optional — leave unset on networks with no canonical USDT (e.g. Fuji)
 *
 * The canonical ERC-4337 EntryPoint v0.6:
 *   0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
 */
contract Deploy is Script {
    // Canonical ERC-4337 EntryPoint v0.6 — same address on all EVM chains
    address constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    struct Deployed {
        AutopayRegistry registry;
        AutopayWalletFactory factory;
        AutopayEscrow escrow;
        AutopayPaymaster paymaster;
    }

    function run() external returns (Deployed memory deployed) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        address signer = vm.envAddress("SIGNER_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address usdt = vm.envOr("USDT_ADDRESS", address(0));

        address deployer = vm.addr(deployerKey);

        console.log("=== Autopayke Contract Deployment ===");
        console.log("Deployer: ", deployer);
        console.log("Admin:    ", admin);
        console.log("Relayer:  ", relayer);
        console.log("Signer:   ", signer);
        console.log("Network:  ", block.chainid == 43114 ? "Avalanche Mainnet" : "Fuji Testnet");
        console.log("");

        vm.startBroadcast(deployerKey);

        // 1. AutopayRegistry
        deployed.registry = new AutopayRegistry(admin, relayer);
        console.log("AutopayRegistry:      ", address(deployed.registry));

        // 2. AutopayWalletFactory
        deployed.factory = new AutopayWalletFactory(
            IEntryPoint(ENTRY_POINT),
            relayer,    // guardian == relayer for Phase 1
            admin,
            relayer
        );
        console.log("AutopayWalletFactory: ", address(deployed.factory));

        // 3. AutopayEscrow
        address[] memory allowedTokens = new address[](usdt == address(0) ? 1 : 2);
        allowedTokens[0] = usdc;
        if (usdt != address(0)) allowedTokens[1] = usdt;
        deployed.escrow = new AutopayEscrow(admin, relayer, signer, allowedTokens);
        console.log("AutopayEscrow:        ", address(deployed.escrow));

        // 4. AutopayPaymaster
        deployed.paymaster = new AutopayPaymaster(
            IEntryPoint(ENTRY_POINT),
            deployed.registry,
            admin,
            relayer
        );
        console.log("AutopayPaymaster:     ", address(deployed.paymaster));

        vm.stopBroadcast();

        // Print env block for .env update
        console.log("");
        console.log("=== Add to .env ===");
        console.log("TUMA_REGISTRY_ADDRESS=", vm.toString(address(deployed.registry)));
        console.log("TUMA_FACTORY_ADDRESS=",  vm.toString(address(deployed.factory)));
        console.log("TUMA_ESCROW_ADDRESS=",   vm.toString(address(deployed.escrow)));
        console.log("TUMA_PAYMASTER_ADDRESS=", vm.toString(address(deployed.paymaster)));

        // Post-deployment checklist
        console.log("");
        console.log("=== Post-deploy checklist ===");
        console.log("[ ] Fund AutopayPaymaster deposit: paymaster.deposit{value: 2 ether}()");
        console.log("[ ] Add paymaster stake: paymaster.addStake{value: 1 ether}(86400)");
        console.log("[ ] Set a daily sponsorship cap: paymaster.setDailySponsorshipLimit(...)");
        console.log("[ ] Set guardian daily spend limits per token on deployed wallets once real balances exist");
        console.log("[ ] Verify contracts on Snowtrace");
        console.log("[ ] Update ADMIN_ADDRESS to multisig after testing");
        console.log("[ ] Move RELAYER_PRIVATE_KEY to a KMS/HSM before mainnet - see audit notes");

        return deployed;
    }
}
