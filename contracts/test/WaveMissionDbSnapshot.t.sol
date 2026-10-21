// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ByUsActionHub} from "../src/ByUsActionHub.sol";
import {ByUsActionCodec} from "../src/ByUsActionCodec.sol";
import {ByUsPublicContextRegistryV3} from "../src/ByUsPublicContextRegistryV3.sol";
import {ByUsPassport} from "../src/ByUsPassport.sol";
import {ByUsStamp} from "../src/ByUsStamp.sol";
import {ByUsCollectible} from "../src/ByUsCollectible.sol";
import {KyaaActionHub} from "../src/KyaaActionHub.sol";
import {KyaaPassport} from "../src/KyaaPassport.sol";
import {KyaaStamp} from "../src/KyaaStamp.sol";
import {MockEAS} from "../src/mocks/MockEAS.sol";

contract WaveMissionDbSnapshotTest is Test {
    ByUsActionHub internal hub;
    ByUsPublicContextRegistryV3 internal registry;
    ByUsStamp internal stamp;
    MockEAS internal eas;
    ByUsActionHub.ActionRequest internal request;
    ByUsActionHub.CredentialIntent[] internal intents;
    address internal writer = makeAddr("wave-writer");

    function setUp() public {
        string memory fixture =
            vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/kyaa-wave-db-snapshot.json"));
        vm.chainId(vm.parseJsonUint(fixture, ".snapshot.chainId"));
        vm.warp(2_000_000_000);
        address[] memory operators = new address[](1);
        operators[0] = address(this);
        address admin = address(new TimelockController(2 days, operators, operators, address(0)));
        registry = new ByUsPublicContextRegistryV3(admin, address(this));
        eas = new MockEAS();
        ByUsPassport passport = new ByUsPassport(admin, writer);
        stamp = new ByUsStamp(admin, writer);
        ByUsCollectible collectible = new ByUsCollectible(admin, writer);
        ByUsActionHub.InitializationConfig memory config = ByUsActionHub.InitializationConfig({
            admin: admin,
            writer: writer,
            migrator: makeAddr("wave-migrator"),
            corrector: makeAddr("wave-corrector"),
            pauser: makeAddr("wave-pauser"),
            easAddress: address(eas),
            environmentId: vm.parseJsonBytes32(fixture, ".snapshot.environmentId"),
            schemaUID: vm.parseJsonBytes32(fixture, ".snapshot.schemaUid"),
            passport: address(passport),
            stamp: address(stamp),
            collectible: address(collectible),
            codec: address(new ByUsActionCodec()),
            contextRegistry: address(registry)
        });
        hub = ByUsActionHub(
            address(new ERC1967Proxy(address(new ByUsActionHub()), abi.encodeCall(ByUsActionHub.initialize, config)))
        );
        vm.startPrank(admin);
        stamp.grantRole(stamp.MINTER_ROLE(), address(hub));
        vm.stopPrank();
        // Local deployment addresses replace fixture routing; source identity and intent stay unchanged.
        request = ByUsActionHub.ActionRequest({
            sourceOccurrence: keccak256(
                abi.encode(
                    vm.parseJsonString(fixture, ".snapshot.sourceNamespace"),
                    vm.parseJsonString(fixture, ".snapshot.canonicalSourceKey")
                )
            ),
            revision: uint32(vm.parseJsonUint(fixture, ".snapshot.revision")),
            actionCode: uint16(vm.parseJsonUint(fixture, ".snapshot.actionCode")),
            schemaVersion: uint16(vm.parseJsonUint(fixture, ".snapshot.schemaVersion")),
            policyVersion: uint32(vm.parseJsonUint(fixture, ".snapshot.policyVersion")),
            fan: vm.parseJsonAddress(fixture, ".snapshot.recipient"),
            creatorId: vm.parseJsonBytes32(fixture, ".snapshot.creatorId"),
            campaignId: vm.parseJsonBytes32(fixture, ".snapshot.campaignId"),
            occurredDay: uint32(vm.parseJsonUint(fixture, ".occurredDay")),
            evidenceCommitment: vm.parseJsonBytes32(fixture, ".snapshot.evidenceCommitment"),
            migrationBatchId: vm.parseJsonBytes32(fixture, ".snapshot.migrationBatchId"),
            bindingVersion: uint32(vm.parseJsonUint(fixture, ".snapshot.bindingVersion"))
        });
        if (request.bindingVersion == 2) {
            KyaaPassport nextPassport = new KyaaPassport(admin, address(hub));
            KyaaStamp nextStamp = new KyaaStamp(admin, address(hub));
            KyaaActionHub next = new KyaaActionHub(address(hub), address(nextPassport), address(nextStamp));
            vm.prank(admin);
            hub.upgradeToAndCall(address(next), abi.encodeCall(next.initializeKyaaBinding, ()));
            stamp = nextStamp;
        }
        assertEq(hub.getAssetBinding(request.bindingVersion, ByUsActionHub.CredentialKind.STAMP), address(stamp));
        assertEq(
            vm.parseJsonString(fixture, ".snapshot.credentials[0].metadata.legacyPayload.stampKind"), "wave_mission"
        );
        assertEq(vm.parseJsonString(fixture, ".snapshot.credentials[0].metadata.legacyPayload.missionKey"), "checkin");
        assertEq(vm.parseJsonString(fixture, ".snapshot.credentials[0].mode"), "MINT");
        assertEq(vm.parseJsonUint(fixture, ".snapshot.credentials[0].kind"), uint8(ByUsActionHub.CredentialKind.STAMP));
        intents.push(
            ByUsActionHub.CredentialIntent({
                kind: ByUsActionHub.CredentialKind.STAMP,
                mode: ByUsActionHub.IntentMode.MINT,
                issuanceKey: vm.parseJsonBytes32(fixture, ".snapshot.credentials[0].issuanceKey"),
                tokenId: 0,
                metadataUri: "ipfs://wave-engineering-metadata"
            })
        );
        registry.registerCreator(request.creatorId, "kyaa-wave-fanpage");
        registry.registerCampaign(request.campaignId, request.creatorId, "kyaa-wave-2026");
    }

    function testDbWaveContextMintsWithCorrectReceiptAndExactReplayDoesNotMint() public {
        assertEq(request.actionCode, 4);
        assertEq(request.bindingVersion, 2);
        assertEq(request.campaignId, bytes32(uint256(0x869cfb38b4384b66a9e3cbce3e2bbd38)));
        assertTrue(registry.isValidContext(request.creatorId, request.campaignId));
        vm.recordLogs();
        vm.prank(writer);
        ByUsActionHub.ActionResult memory first = hub.recordAndIssue(request, intents);
        Vm.Log[] memory receipt = vm.getRecordedLogs();
        bool recorded;
        bool linked;
        for (uint256 i; i < receipt.length; ++i) {
            if (receipt[i].emitter != address(hub)) continue;
            if (receipt[i].topics[0] == ByUsActionHub.FanActionRecorded.selector) {
                assertEq(receipt[i].topics[1], first.actionId);
                assertEq(receipt[i].topics[3], request.campaignId);
                (bytes32 occurrence,, bytes32 creatorId, string memory actionName,,,,,,) = abi.decode(
                    receipt[i].data, (bytes32, uint32, bytes32, string, uint16, uint32, bytes32, uint32, uint8, bytes32)
                );
                assertEq(occurrence, hub.computeOccurrenceId(request.sourceOccurrence));
                assertEq(creatorId, request.creatorId);
                assertEq(actionName, "MISSION_COMPLETED");
                recorded = true;
            } else if (receipt[i].topics[0] == ByUsActionHub.CredentialLinked.selector) {
                assertEq(address(uint160(uint256(receipt[i].topics[2]))), address(stamp));
                (uint8 kind, bytes32 issuanceKey,) = abi.decode(receipt[i].data, (uint8, bytes32, uint8));
                assertEq(kind, uint8(ByUsActionHub.CredentialKind.STAMP));
                assertEq(issuanceKey, intents[0].issuanceKey);
                linked = true;
            }
        }
        assertTrue(recorded);
        assertTrue(linked);
        assertEq(hub.getAction(first.actionId).actionCode, 4);
        assertEq(eas.attestCount(), 1);
        uint256 tokenId = stamp.tokenByIssuanceId(intents[0].issuanceKey);
        assertEq(stamp.balanceOf(request.fan, tokenId), 1);
        vm.recordLogs();
        vm.prank(writer);
        ByUsActionHub.ActionResult memory replay = hub.recordAndIssue(request, intents);
        assertEq(replay.actionId, first.actionId);
        assertEq(replay.easUID, first.easUID);
        assertEq(stamp.tokenByIssuanceId(intents[0].issuanceKey), tokenId);
        assertEq(stamp.balanceOf(request.fan, tokenId), 1);
        assertEq(eas.attestCount(), 1);
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function testDbWaveMissionZeroCampaignFailsActualHubContextValidation() public {
        request.campaignId = bytes32(0);
        // Registry permits creator-only context; action 4 itself must require a campaign.
        assertTrue(registry.isValidContext(request.creatorId, bytes32(0)));
        vm.expectRevert(ByUsActionHub.InvalidActionContext.selector);
        vm.prank(writer);
        hub.recordAndIssue(request, intents);
        assertEq(eas.attestCount(), 0);
        assertEq(stamp.tokenByIssuanceId(intents[0].issuanceKey), 0);
    }
}
