// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlDefaultAdminRules } from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Source-by-source participation attestations, independent of credential rewards.
contract ByUsParticipationLedger is AccessControlDefaultAdminRules, Pausable {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");
    uint256 public constant MAX_BATCH_SIZE = 20;

    struct Participation {
        bytes32 source;
        bytes32 creator;
        bytes32 participant;
        uint64 occurredAtMicros;
        uint64 revision;
        uint8 kind;
        uint8 origin;
        bool active;
    }

    struct Counts {
        uint256 reservations;
        uint256 passports;
        uint256 likes;
        uint256 comments;
        uint256 engagedFans;
    }

    mapping(bytes32 => Participation) public participations;
    mapping(bytes32 => mapping(uint256 => Counts)) private _counts;
    mapping(bytes32 => mapping(uint256 => mapping(bytes32 => uint256))) private _fanReferences;

    error InvalidParticipation();
    error ImmutableIdentity();
    error RevisionConflict();
    error InvalidBatch();

    event ParticipationRecorded(
        bytes32 indexed source, bytes32 indexed creator, bytes32 indexed participant,
        uint64 occurredAtMicros, uint64 revision, uint8 kind, uint8 origin, bool active
    );

    constructor(address initialAdmin, address recorder)
        AccessControlDefaultAdminRules(2 days, initialAdmin)
    {
        if (recorder == address(0)) revert InvalidParticipation();
        (bool ok, bytes memory delay) = initialAdmin.staticcall(abi.encodeWithSignature("getMinDelay()"));
        if (initialAdmin.code.length == 0 || !ok || delay.length != 32 || abi.decode(delay, (uint256)) < 2 days) {
            revert InvalidParticipation();
        }
        _grantRole(RECORDER_ROLE, recorder);
    }

    /// @notice Day zero is all time; other keys are KST epoch days plus one.
    function kstDay(uint64 occurredAtMicros) public pure returns (uint256) {
        return (uint256(occurredAtMicros) / 1_000_000 + 9 hours) / 1 days + 1;
    }

    function counts(bytes32 creator, uint256 day) external view returns (Counts memory) {
        return _counts[creator][day];
    }

    function record(Participation[] calldata items) external onlyRole(RECORDER_ROLE) whenNotPaused {
        if (items.length == 0 || items.length > MAX_BATCH_SIZE) revert InvalidBatch();
        for (uint256 i; i < items.length; ++i) _record(items[i]);
    }

    function _record(Participation calldata item) private {
        if (item.source == bytes32(0) || (item.creator != bytes32("changha") && item.creator != bytes32("wena")) || item.participant == bytes32(0)
            || item.revision == 0 || item.kind < 1 || item.kind > 4 || item.origin > 1
            || item.occurredAtMicros == 0 || uint256(item.occurredAtMicros) > block.timestamp * 1_000_000) {
            revert InvalidParticipation();
        }
        Participation storage prior = participations[item.source];
        if (prior.revision != 0) {
            if (prior.creator != item.creator || prior.participant != item.participant
                || prior.occurredAtMicros != item.occurredAtMicros || prior.kind != item.kind
                || prior.origin != item.origin) revert ImmutableIdentity();
            if (item.revision < prior.revision) return;
            if (item.revision == prior.revision) {
                if (item.active != prior.active) revert RevisionConflict();
                return;
            }
        }
        if (prior.active != item.active) {
            _change(item, 0);
            _change(item, kstDay(item.occurredAtMicros));
        }
        participations[item.source] = item;
        emit ParticipationRecorded(item.source, item.creator, item.participant,
            item.occurredAtMicros, item.revision, item.kind, item.origin, item.active);
    }

    function _change(Participation calldata item, uint256 day) private {
        Counts storage total = _counts[item.creator][day];
        uint256 references = _fanReferences[item.creator][day][item.participant];
        if (item.active) {
            if (item.kind == 1) ++total.reservations;
            else if (item.kind == 2) ++total.passports;
            else if (item.kind == 3) ++total.likes;
            else ++total.comments;
            if (references == 0) ++total.engagedFans;
            _fanReferences[item.creator][day][item.participant] = references + 1;
        } else {
            if (item.kind == 1) --total.reservations;
            else if (item.kind == 2) --total.passports;
            else if (item.kind == 3) --total.likes;
            else --total.comments;
            if (references == 1) --total.engagedFans;
            _fanReferences[item.creator][day][item.participant] = references - 1;
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
