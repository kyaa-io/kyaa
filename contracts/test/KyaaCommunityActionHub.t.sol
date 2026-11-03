// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ByUsActionHubTest } from "./ByUsActionHub.t.sol";
import { ByUsActionHub } from "../src/ByUsActionHub.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { KyaaActionHub } from "../src/KyaaActionHub.sol";
import { KyaaCommunityActionHub } from "../src/KyaaCommunityActionHub.sol";
import { KyaaPassport } from "../src/KyaaPassport.sol";
import { KyaaStamp } from "../src/KyaaStamp.sol";

contract KyaaCommunityActionHubTest is ByUsActionHubTest {
    bytes32 private constant CODEC_SLOT =
        bytes32(uint256(0x9b4561162b6d58cdaee430aa4073a2ec544ff4ca21320ef4e942bd0b419f7700) + 6);
    address private previousCodec;
    KyaaPassport private nextPassport;
    KyaaStamp private nextStamp;

    function _hasRole(bytes32 role, address account) private view returns (bool) {
        bytes32 rolesSlot = bytes32(uint256(CODEC_SLOT) + 3);
        return vm.load(
            address(hub), keccak256(abi.encode(account, keccak256(abi.encode(role, rolesSlot))))
        ) == bytes32(uint256(1));
    }

    function _deploy(bytes memory creation) private returns (address deployed) {
        assembly ("memory-safe") { deployed := create(0, add(creation, 32), mload(creation)) }
        require(deployed != address(0), "fixture deployment failed");
    }

    function _priorV3() private {
        previousCodec = _deploy(vm.getCode("test/fixtures/ByUsActionCodecV3.json"));
        assertEq(
            previousCodec.codehash,
            0xe3095c9a1847be6e857e06f7182d417597094331c3a2ab5b2058253ab248bc39
        );
        address oldBase = _deploy(vm.getCode("test/fixtures/ByUsActionHubV3.json"));
        vm.store(
            address(hub),
            0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc,
            bytes32(uint256(uint160(oldBase)))
        );
        vm.store(address(hub), CODEC_SLOT, bytes32(uint256(uint160(previousCodec))));
        nextPassport = new KyaaPassport(admin, address(hub));
        nextStamp = new KyaaStamp(admin, address(hub));
        address prior = _deploy(
            bytes.concat(
                vm.getCode("test/fixtures/KyaaActionHubV3.json"),
                abi.encode(address(hub), address(nextPassport), address(nextStamp))
            )
        );
        _upgrade(prior, abi.encodeCall(KyaaActionHub.initializeKyaaBinding, ()), "prior-v3");
    }

    function _upgrade(address next, bytes memory data, bytes32 salt) private {
        bytes memory upgradeCall =
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", next, data);
        timelock.schedule(address(hub), 0, upgradeCall, bytes32(0), salt, 2 days);
        vm.warp(block.timestamp + 2 days);
        timelock.execute(address(hub), 0, upgradeCall, bytes32(0), salt);
    }

    function _next() private returns (KyaaCommunityActionHub) {
        return new KyaaCommunityActionHub(
            address(hub), address(nextPassport), address(nextStamp), previousCodec, address(codec)
        );
    }

    function testV3UpgradePreservesHashesRolesBindingsAndPendingPayload() public {
        _priorV3();
        ByUsActionHub.ActionRequest memory pending = _request(keccak256("pending"), 2, fan);
        pending.bindingVersion = 2;
        ByUsActionHub.CredentialIntent[] memory intents = _stampIntent("pending");
        bytes32 pendingHash =
            hub.hashRequest(ByUsActionHub.OperationKind.RECORD_AND_ISSUE, pending, intents);
        ByUsActionHub.ActionRequest memory historical =
            _historicalRequest(keccak256("precommitted-merkle"), 2);
        historical.bindingVersion = 2;
        ByUsActionHub.CredentialIntent[] memory historicalIntents =
            _stampIntent("precommitted-merkle");
        _registerSingleLeafBatch(historical, historicalIntents, 1);
        bytes32[11] memory hashes;
        for (uint16 code = 1; code <= 11; ++code) {
            ByUsActionHub.ActionRequest memory request = _request(bytes32(uint256(code)), code, fan);
            hashes[code - 1] =
                hub.hashRequest(ByUsActionHub.OperationKind.RECORD_AND_ISSUE, request, intents);
        }
        vm.prank(writer);
        ByUsActionHub.ActionResult memory old =
            hub.recordAndIssue(_request(keccak256("old"), 2, fan), _stampIntent("old"));
        bytes memory oldRecord = abi.encode(hub.getAction(old.actionId));
        KyaaCommunityActionHub next = _next();
        assertLe(address(next).code.length, 24_576);
        _upgrade(address(next), abi.encodeCall(next.initializeCommunityCodec, ()), "community-v4");
        assertEq(address(uint160(uint256(vm.load(address(hub), CODEC_SLOT)))), address(codec));
        for (uint16 code = 1; code <= 11; ++code) {
            ByUsActionHub.ActionRequest memory request = _request(bytes32(uint256(code)), code, fan);
            request.occurredDay -= 2;
            assertEq(
                hub.hashRequest(ByUsActionHub.OperationKind.RECORD_AND_ISSUE, request, intents),
                hashes[code - 1]
            );
        }
        assertEq(abi.encode(hub.getAction(old.actionId)), oldRecord);
        assertTrue(_isCurrentEasValid(old.actionId));
        vm.prank(migrator);
        hub.importHistorical(historical, historicalIntents, new bytes32[](0));
        assertEq(nextStamp.balanceOf(fan, 1), 1);
        assertEq(hub.environmentId(), ENVIRONMENT_ID);
        assertEq(hub.eas(), address(eas));
        assertEq(hub.getSchema(1), SCHEMA_UID);
        assertEq(hub.getAssetBinding(1, ByUsActionHub.CredentialKind.PASSPORT), address(passport));
        assertEq(hub.getAssetBinding(1, ByUsActionHub.CredentialKind.STAMP), address(stamp));
        assertEq(
            hub.getAssetBinding(1, ByUsActionHub.CredentialKind.COLLECTIBLE), address(collectible)
        );
        assertEq(
            hub.getAssetBinding(2, ByUsActionHub.CredentialKind.PASSPORT), address(nextPassport)
        );
        assertEq(hub.getAssetBinding(2, ByUsActionHub.CredentialKind.STAMP), address(nextStamp));
        assertEq(hub.getAssetBinding(2, ByUsActionHub.CredentialKind.COLLECTIBLE), address(0));
        assertTrue(_hasRole(hub.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(_hasRole(hub.UPGRADER_ROLE(), admin));
        assertTrue(_hasRole(hub.WRITER_ROLE(), writer));
        assertTrue(_hasRole(hub.MIGRATOR_ROLE(), migrator));
        assertTrue(_hasRole(hub.CORRECTOR_ROLE(), corrector));
        assertTrue(_hasRole(hub.PAUSER_ROLE(), pauser));
        assertEq(
            hub.hashRequest(ByUsActionHub.OperationKind.RECORD_AND_ISSUE, pending, intents),
            pendingHash
        );
        vm.prank(writer);
        ByUsActionHub.ActionResult memory result = hub.recordAndIssue(pending, intents);
        assertEq(result.requestHash, pendingHash);
        vm.prank(writer);
        assertEq(hub.recordAndIssue(pending, intents).actionId, result.actionId);
        vm.prank(admin);
        vm.expectRevert();
        KyaaCommunityActionHub(address(hub)).initializeCommunityCodec();
    }

    function testCommunityRequiresCreatorAndExactlyOneStamp() public {
        _priorV3();
        KyaaCommunityActionHub next = _next();
        _upgrade(address(next), abi.encodeCall(next.initializeCommunityCodec, ()), "community-v4");
        assertEq(codec.actionName(12), "COMMUNITY_STAMP_ISSUED");
        ByUsActionHub.ActionRequest memory request = _request(keccak256("community"), 12, fan);
        request.campaignId = bytes32(0);
        request.bindingVersion = 2;
        ByUsActionHub.CredentialIntent[] memory intents = _stampIntent("community");
        request.creatorId = bytes32(0);
        vm.prank(writer);
        vm.expectRevert(ByUsActionHub.InvalidActionContext.selector);
        hub.recordAndIssue(request, intents);
        request.creatorId = CREATOR_ID;
        vm.prank(writer);
        vm.expectRevert(ByUsActionHub.InvalidCredentialPolicy.selector);
        hub.recordAndIssue(request, new ByUsActionHub.CredentialIntent[](0));
        intents[0].kind = ByUsActionHub.CredentialKind.PASSPORT;
        vm.prank(writer);
        vm.expectRevert(ByUsActionHub.InvalidCredentialPolicy.selector);
        hub.recordAndIssue(request, intents);
        vm.prank(writer);
        vm.expectRevert(ByUsActionHub.InvalidCredentialPolicy.selector);
        hub.recordAndIssue(request, _fanVerifiedIntents("too-many"));
        intents[0].kind = ByUsActionHub.CredentialKind.STAMP;
        vm.prank(writer);
        ByUsActionHub.ActionResult memory result = hub.recordAndIssue(request, intents);
        assertEq(nextStamp.balanceOf(fan, 1), 1);
        assertEq(hub.getAction(result.actionId).actionCode, 12);
        request.revision = 2;
        vm.prank(corrector);
        vm.expectRevert(ByUsActionHub.InvalidCredentialPolicy.selector);
        hub.correct(result.actionId, request, new ByUsActionHub.CredentialIntent[](0));
    }

    function testInitRejectsDirectUnauthorizedAndChangedCodec() public {
        _priorV3();
        KyaaCommunityActionHub next = _next();
        vm.prank(admin);
        vm.expectRevert();
        next.initializeCommunityCodec();
        _upgrade(address(next), bytes(""), "community-uninitialized");
        vm.prank(stranger);
        vm.expectRevert(ByUsActionHub.AccessDenied.selector);
        KyaaCommunityActionHub(address(hub)).initializeCommunityCodec();
        vm.store(address(hub), CODEC_SLOT, bytes32(uint256(uint160(address(codec)))));
        vm.prank(admin);
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        KyaaCommunityActionHub(address(hub)).initializeCommunityCodec();
        vm.store(address(hub), CODEC_SLOT, bytes32(uint256(uint160(previousCodec))));
        bytes memory oldCode = previousCodec.code;
        vm.etch(previousCodec, hex"00");
        vm.prank(admin);
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        KyaaCommunityActionHub(address(hub)).initializeCommunityCodec();
        vm.etch(previousCodec, oldCode);
        vm.etch(address(codec), hex"00");
        vm.prank(admin);
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        KyaaCommunityActionHub(address(hub)).initializeCommunityCodec();
    }

    function testInitRejectsWrongProxyAndPrivilegedNonGovernance() public {
        _priorV3();
        KyaaCommunityActionHub next = _next();
        ByUsActionHub.InitializationConfig memory config = ByUsActionHub.InitializationConfig({
            admin: admin,
            writer: writer,
            migrator: migrator,
            corrector: corrector,
            pauser: pauser,
            easAddress: address(eas),
            environmentId: ENVIRONMENT_ID,
            schemaUID: SCHEMA_UID,
            passport: address(passport),
            stamp: address(stamp),
            collectible: address(collectible),
            codec: address(codec),
            contextRegistry: address(contextRegistry)
        });
        ERC1967Proxy other =
            new ERC1967Proxy(address(next), abi.encodeCall(ByUsActionHub.initialize, config));
        vm.prank(admin);
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        KyaaCommunityActionHub(address(other)).initializeCommunityCodec();
        _upgrade(address(next), bytes(""), "uninitialized-v4");
        vm.prank(admin);
        hub.setRole(bytes32(0), stranger, true);
        vm.prank(stranger);
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        KyaaCommunityActionHub(address(hub)).initializeCommunityCodec();
    }

    function testConstructorRejectsUnpinnedCodecAndChangedBindings() public {
        _priorV3();
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        new KyaaCommunityActionHub(
            address(hub), address(nextPassport), address(nextStamp), address(codec), address(codec)
        );
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        new KyaaCommunityActionHub(
            address(hub), address(nextPassport), address(nextStamp), previousCodec, previousCodec
        );
        KyaaPassport other = new KyaaPassport(admin, address(hub));
        vm.expectRevert(KyaaCommunityActionHub.InvalidCommunityTransition.selector);
        new KyaaCommunityActionHub(
            address(hub), address(other), address(nextStamp), previousCodec, address(codec)
        );
    }
}
