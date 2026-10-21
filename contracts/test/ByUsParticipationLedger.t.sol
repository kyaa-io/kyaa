// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ByUsParticipationLedger } from "../src/ByUsParticipationLedger.sol";

contract ByUsParticipationLedgerTest is Test {
    ByUsParticipationLedger ledger;
    address admin = makeAddr("timelock");
    address recorder = makeAddr("recorder");
    bytes32 creator = bytes32("changha");
    uint64 boundary = 1792594800000000; // 2026-10-22 00:00:00 KST, microseconds.

    function setUp() public {
        vm.warp(1792767600);
        vm.etch(admin, hex"00");
        vm.mockCall(admin, abi.encodeWithSignature("getMinDelay()"), abi.encode(uint256(2 days)));
        ledger = new ByUsParticipationLedger(admin, recorder);
    }

    function item(uint256 source, uint256 actor, uint8 kind, uint64 time)
        internal view returns (ByUsParticipationLedger.Participation memory)
    {
        return ByUsParticipationLedger.Participation(bytes32(source), creator, bytes32(actor), time, 1, kind, 1, true);
    }

    function write(ByUsParticipationLedger.Participation memory value) internal {
        ByUsParticipationLedger.Participation[] memory rows = new ByUsParticipationLedger.Participation[](1);
        rows[0] = value;
        vm.prank(recorder);
        ledger.record(rows);
    }

    function testFourKindsRepeatedCommentsAndDistinctFans() public {
        for (uint8 kind = 1; kind <= 4; ++kind) write(item(kind, 10, kind, boundary));
        write(item(5, 10, 4, boundary + 1));
        write(item(6, 11, 4, boundary + 2));
        ByUsParticipationLedger.Counts memory total = ledger.counts(creator, 0);
        assertEq(total.reservations, 1); assertEq(total.passports, 1);
        assertEq(total.likes, 1); assertEq(total.comments, 3); assertEq(total.engagedFans, 2);
        assertEq(ledger.counts(creator, ledger.kstDay(boundary)).engagedFans, 2);
        assertEq(ledger.counts(bytes32("wena"), 0).engagedFans, 0);
    }

    function testDuplicateReverseRevisionAndRestore() public {
        ByUsParticipationLedger.Participation memory value = item(1, 10, 4, boundary);
        write(value); write(value);
        value.revision = 3; value.active = false; write(value);
        assertEq(ledger.counts(creator, 0).comments, 0);
        value.revision = 2; value.active = true; write(value);
        assertEq(ledger.counts(creator, 0).engagedFans, 0);
        value.revision = 4; write(value); write(value);
        assertEq(ledger.counts(creator, 0).comments, 1);
        assertEq(ledger.counts(creator, 0).engagedFans, 1);
    }

    function testFanReferenceAcrossKindsAndKstMidnight() public {
        ByUsParticipationLedger.Participation memory prior = item(1, 10, 1, boundary - 1);
        ByUsParticipationLedger.Participation memory next = item(2, 10, 4, boundary);
        write(prior); write(next);
        assertEq(ledger.kstDay(boundary), ledger.kstDay(boundary - 1) + 1);
        assertEq(ledger.counts(creator, 0).engagedFans, 1);
        next.revision = 2; next.active = false; write(next);
        assertEq(ledger.counts(creator, ledger.kstDay(boundary)).engagedFans, 0);
        assertEq(ledger.counts(creator, 0).engagedFans, 1);
        prior.revision = 2; prior.active = false; write(prior);
        assertEq(ledger.counts(creator, 0).engagedFans, 0);
    }

    function testImmutableIdentityAndSameRevisionConflict() public {
        ByUsParticipationLedger.Participation memory value = item(1, 10, 4, boundary);
        write(value);
        value.active = false;
        vm.expectRevert(ByUsParticipationLedger.RevisionConflict.selector); write(value);
        value.revision = 2; value.participant = bytes32(uint256(11));
        vm.expectRevert(ByUsParticipationLedger.ImmutableIdentity.selector); write(value);
        value.revision = 1;
        vm.expectRevert(ByUsParticipationLedger.ImmutableIdentity.selector); write(value);
        assertEq(ledger.counts(creator, 0).comments, 1);
    }

    function testBatchAtomicityAndAuthorization() public {
        ByUsParticipationLedger.Participation[] memory rows = new ByUsParticipationLedger.Participation[](2);
        rows[0] = item(1, 10, 4, boundary);
        rows[1] = item(2, 10, 0, boundary);
        vm.expectRevert(); ledger.record(rows);
        vm.prank(recorder); vm.expectRevert(ByUsParticipationLedger.InvalidParticipation.selector); ledger.record(rows);
        assertEq(ledger.counts(creator, 0).comments, 0);
        vm.prank(admin); ledger.pause();
        vm.expectRevert(); write(rows[0]);
        vm.prank(admin); ledger.unpause(); write(rows[0]);
        assertFalse(ledger.hasRole(ledger.DEFAULT_ADMIN_ROLE(), address(this)));
        assertTrue(ledger.hasRole(ledger.DEFAULT_ADMIN_ROLE(), admin));
    }

    function testInactiveFirstRecordAndFutureTimestamp() public {
        ByUsParticipationLedger.Participation memory value = item(1, 10, 4, boundary);
        value.active = false; value.revision = 5; write(value);
        assertEq(ledger.counts(creator, 0).comments, 0);
        value.active = true; value.revision = 6; write(value);
        value = item(2, 10, 4, uint64(block.timestamp * 1_000_000 + 1));
        vm.expectRevert(ByUsParticipationLedger.InvalidParticipation.selector); write(value);
    }

    function testBatchBoundsAndTrustBoundary() public {
        ByUsParticipationLedger.Participation[] memory rows = new ByUsParticipationLedger.Participation[](0);
        vm.prank(recorder); vm.expectRevert(ByUsParticipationLedger.InvalidBatch.selector); ledger.record(rows);
        rows = new ByUsParticipationLedger.Participation[](21);
        vm.prank(recorder); vm.expectRevert(ByUsParticipationLedger.InvalidBatch.selector); ledger.record(rows);
        for (uint256 i; i < 8; ++i) {
            ByUsParticipationLedger.Participation memory value = item(1, 10, 4, boundary);
            if (i == 0) value.source = bytes32(0);
            else if (i == 1) value.creator = bytes32("other");
            else if (i == 2) value.participant = bytes32(0);
            else if (i == 3) value.revision = 0;
            else if (i == 4) value.kind = 0;
            else if (i == 5) value.kind = 5;
            else if (i == 6) value.origin = 2;
            else value.occurredAtMicros = 0;
            vm.expectRevert(ByUsParticipationLedger.InvalidParticipation.selector); write(value);
        }
    }

    function testTwentyFreshParticipantsAcrossCreatorsAndDaysGas() public {
        ByUsParticipationLedger.Participation[] memory rows = new ByUsParticipationLedger.Participation[](20);
        for (uint256 i; i < 20; ++i) {
            rows[i] = item(i + 1, i + 1, uint8(i % 4 + 1), boundary - uint64(i * 1 days * 1_000_000));
            if (i % 2 == 1) rows[i].creator = bytes32("wena");
        }
        uint256 beforeGas = gasleft();
        vm.prank(recorder); ledger.record(rows);
        uint256 used = beforeGas - gasleft();
        emit log_named_uint("20 fresh participant mixed-day batch gas", used);
        assertLt(used + 100_000, 4_000_000);
        assertEq(ledger.counts(creator, 0).engagedFans, 10);
        assertEq(ledger.counts(bytes32("wena"), 0).engagedFans, 10);
    }

    function testFiveFreshParticipantsWithinGasCap() public {
        ByUsParticipationLedger.Participation[] memory rows = new ByUsParticipationLedger.Participation[](5);
        for (uint256 i; i < 5; ++i) rows[i] = item(i + 1, i + 1, uint8(i % 4 + 1), boundary);
        uint256 beforeGas = gasleft();
        vm.prank(recorder); ledger.record(rows);
        uint256 used = beforeGas - gasleft();
        emit log_named_uint("5 fresh participant batch gas", used);
        assertLt(used + 100_000, 1_500_000);
    }

    function testFourFreshParticipantsAcrossCreatorsAndDaysWithinDefaultCap() public {
        ByUsParticipationLedger.Participation[] memory rows = new ByUsParticipationLedger.Participation[](4);
        for (uint256 i; i < 4; ++i) {
            rows[i] = item(i + 1, i + 1, uint8(i + 1), boundary - uint64(i * 1 days * 1_000_000));
            if (i % 2 == 1) rows[i].creator = bytes32("wena");
        }
        uint256 beforeGas = gasleft();
        vm.prank(recorder); ledger.record(rows);
        uint256 used = beforeGas - gasleft();
        emit log_named_uint("4 source worst fresh day/creator batch gas", used);
        assertLt(used + 100_000, 1_000_000);
    }

    function testGovernanceAndRecorderAdministration() public {
        bytes32 role = ledger.RECORDER_ROLE();
        vm.expectRevert(); ledger.grantRole(role, address(this));
        vm.prank(admin); ledger.revokeRole(role, recorder);
        vm.expectRevert(); write(item(1, 10, 4, boundary));
        vm.prank(admin); ledger.grantRole(role, recorder);
        write(item(1, 10, 4, boundary));
        vm.expectRevert(ByUsParticipationLedger.InvalidParticipation.selector);
        new ByUsParticipationLedger(makeAddr("wrongAdmin"), recorder);
        vm.mockCall(admin, abi.encodeWithSignature("getMinDelay()"), abi.encode(uint256(1 days)));
        vm.expectRevert(ByUsParticipationLedger.InvalidParticipation.selector);
        new ByUsParticipationLedger(admin, recorder);
    }

    function testFuzzRevisionSequencePreservesCounts(uint256 seed) public {
        bool[8] memory active;
        uint64[8] memory revision;
        for (uint256 step; step < 32; ++step) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 index = seed % 8;
            active[index] = !active[index];
            ByUsParticipationLedger.Participation memory value = item(index + 1, index % 2 + 1, uint8(index % 4 + 1), boundary + uint64(index % 2));
            value.active = active[index]; value.revision = ++revision[index]; write(value); write(value);
            uint256[4] memory expected;
            bool[2] memory fans;
            for (uint256 j; j < 8; ++j) if (active[j]) { ++expected[j % 4]; fans[j % 2] = true; }
            ByUsParticipationLedger.Counts memory total = ledger.counts(creator, 0);
            assertEq(total.reservations, expected[0]); assertEq(total.passports, expected[1]);
            assertEq(total.likes, expected[2]); assertEq(total.comments, expected[3]);
            assertEq(total.engagedFans, (fans[0] ? 1 : 0) + (fans[1] ? 1 : 0));
            assertEq(ledger.counts(creator, ledger.kstDay(boundary)).engagedFans, total.engagedFans);
        }
    }
}
