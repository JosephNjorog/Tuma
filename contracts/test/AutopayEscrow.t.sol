// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AutopayEscrow.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Minimal USDC mock
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AutopayEscrowTest is Test {
    AutopayEscrow public escrow;
    MockUSDC public usdc;

    address public admin   = makeAddr("admin");
    address public relayer = makeAddr("relayer");
    uint256 public signerKey = 0xA11CE;
    address public signer  = vm.addr(signerKey);

    address public sender    = makeAddr("sender");
    address public recipient = makeAddr("recipient");
    address public attacker  = makeAddr("attacker");

    bytes32 constant CLAIM_REF = keccak256("ESC-1234");
    uint256 constant AMOUNT    = 50_000_000; // 50 USDC (6 decimals)
    uint256 constant EXPIRY    = 7 days;

    function setUp() public {
        usdc = new MockUSDC();
        address[] memory initialTokens = new address[](1);
        initialTokens[0] = address(usdc);
        escrow = new AutopayEscrow(admin, relayer, signer, initialTokens);

        // Fund sender and approve escrow
        usdc.mint(sender, AMOUNT * 10);
        vm.prank(sender);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── deposit ───────────────────────────────────────────────────────────────

    function test_deposit_success() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        (
            address _sender,
            address _token,
            uint256 _amount,
            uint256 _expiry,
            AutopayEscrow.EscrowStatus _status
        ) = escrow.getPayment(CLAIM_REF);

        assertEq(_sender, sender);
        assertEq(_token, address(usdc));
        assertEq(_amount, AMOUNT);
        assertEq(uint8(_status), uint8(AutopayEscrow.EscrowStatus.Pending));
        assertTrue(_expiry > block.timestamp);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
    }

    function test_deposit_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit AutopayEscrow.Deposited(
            CLAIM_REF,
            sender,
            address(usdc),
            AMOUNT,
            block.timestamp + EXPIRY
        );

        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);
    }

    function test_deposit_revertsOnDuplicate() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(AutopayEscrow.AlreadyExists.selector, CLAIM_REF));
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);
    }

    function test_deposit_revertsOnZeroAmount() public {
        vm.prank(sender);
        vm.expectRevert(AutopayEscrow.ZeroAmount.selector);
        escrow.deposit(CLAIM_REF, address(usdc), 0, EXPIRY);
    }

    function test_deposit_revertsOnExpiryTooShort() public {
        vm.prank(sender);
        vm.expectRevert(AutopayEscrow.InvalidExpiry.selector);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, 30 minutes);
    }

    function test_deposit_revertsOnExpiryTooLong() public {
        vm.prank(sender);
        vm.expectRevert(AutopayEscrow.InvalidExpiry.selector);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, 31 days);
    }

    // ── claim ─────────────────────────────────────────────────────────────────

    function _signerSign(bytes32 claimRef, address recip) internal view returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encodePacked(claimRef, recip, block.chainid)
        );
        bytes32 ethDigest = MessageHashUtils.toEthSignedMessageHash(digest);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function test_claim_success() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        bytes memory sig = _signerSign(CLAIM_REF, recipient);

        vm.prank(recipient);
        escrow.claim(CLAIM_REF, recipient, sig);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        (,,, , AutopayEscrow.EscrowStatus status) = escrow.getPayment(CLAIM_REF);
        assertEq(uint8(status), uint8(AutopayEscrow.EscrowStatus.Claimed));
    }

    function test_claim_emitsEvent() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        bytes memory sig = _signerSign(CLAIM_REF, recipient);

        vm.expectEmit(true, true, false, true);
        emit AutopayEscrow.Claimed(CLAIM_REF, recipient, address(usdc), AMOUNT);

        escrow.claim(CLAIM_REF, recipient, sig);
    }

    function test_claim_revertsOnInvalidSig() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        // Sign for wrong recipient
        bytes memory badSig = _signerSign(CLAIM_REF, attacker);

        vm.expectRevert(AutopayEscrow.InvalidSignature.selector);
        escrow.claim(CLAIM_REF, recipient, badSig);
    }

    function test_claim_revertsIfAlreadyClaimed() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        bytes memory sig = _signerSign(CLAIM_REF, recipient);
        escrow.claim(CLAIM_REF, recipient, sig);

        vm.expectRevert(
            abi.encodeWithSelector(
                AutopayEscrow.AlreadyResolved.selector,
                CLAIM_REF,
                AutopayEscrow.EscrowStatus.Claimed
            )
        );
        escrow.claim(CLAIM_REF, recipient, sig);
    }

    // ── refund ────────────────────────────────────────────────────────────────

    function test_refund_afterExpiry() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        vm.warp(block.timestamp + EXPIRY + 1);

        uint256 senderBalanceBefore = usdc.balanceOf(sender);
        escrow.refund(CLAIM_REF);

        assertEq(usdc.balanceOf(sender), senderBalanceBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        (,,,, AutopayEscrow.EscrowStatus status) = escrow.getPayment(CLAIM_REF);
        assertEq(uint8(status), uint8(AutopayEscrow.EscrowStatus.Refunded));
    }

    function test_refund_revertsBeforeExpiry() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        vm.expectRevert(); // NotExpired
        escrow.refund(CLAIM_REF);
    }

    function test_refund_revertsIfAlreadyClaimed() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        bytes memory sig = _signerSign(CLAIM_REF, recipient);
        escrow.claim(CLAIM_REF, recipient, sig);

        vm.warp(block.timestamp + EXPIRY + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                AutopayEscrow.AlreadyResolved.selector,
                CLAIM_REF,
                AutopayEscrow.EscrowStatus.Claimed
            )
        );
        escrow.refund(CLAIM_REF);
    }

    // ── isRefundable ──────────────────────────────────────────────────────────

    function test_isRefundable_falseBeforeExpiry() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);
        assertFalse(escrow.isRefundable(CLAIM_REF));
    }

    function test_isRefundable_trueAfterExpiry() public {
        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(usdc), AMOUNT, EXPIRY);

        vm.warp(block.timestamp + EXPIRY + 1);
        assertTrue(escrow.isRefundable(CLAIM_REF));
    }

    // ── Token allowlist ───────────────────────────────────────────────────────

    function test_deposit_revertsForDisallowedToken() public {
        MockUSDC randomToken = new MockUSDC();
        randomToken.mint(sender, AMOUNT);
        vm.prank(sender);
        randomToken.approve(address(escrow), type(uint256).max);

        vm.prank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(AutopayEscrow.TokenNotAllowed.selector, address(randomToken))
        );
        escrow.deposit(CLAIM_REF, address(randomToken), AMOUNT, EXPIRY);
    }

    function test_setTokenAllowed_adminCanAllowNewToken() public {
        MockUSDC randomToken = new MockUSDC();
        randomToken.mint(sender, AMOUNT);
        vm.prank(sender);
        randomToken.approve(address(escrow), type(uint256).max);

        vm.prank(admin);
        escrow.setTokenAllowed(address(randomToken), true);

        vm.prank(sender);
        escrow.deposit(CLAIM_REF, address(randomToken), AMOUNT, EXPIRY);
        (, address token,,,) = escrow.getPayment(CLAIM_REF);
        assertEq(token, address(randomToken));
    }

    function test_setTokenAllowed_revertsForStranger() public {
        vm.prank(attacker);
        vm.expectRevert();
        escrow.setTokenAllowed(address(usdc), false);
    }
}
