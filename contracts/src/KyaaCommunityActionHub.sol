// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ByUsActionHub } from "./ByUsActionHub.sol";
import { ByUsActionCodec } from "./ByUsActionCodec.sol";
import { KyaaPassport } from "./KyaaPassport.sol";
import { KyaaStamp } from "./KyaaStamp.sol";

/// @dev V4 preserves V3's immutable binding and changes only the existing codec slot.
contract KyaaCommunityActionHub is ByUsActionHub {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable _expectedHub;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable _governance;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable _kyaaPassport;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable _kyaaStamp;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable _previousCodec;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable _nextCodec;

    bytes32 private constant PREVIOUS_CODEC_CODEHASH =
        0xe3095c9a1847be6e857e06f7182d417597094331c3a2ab5b2058253ab248bc39;

    error InvalidCommunityTransition();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address expectedHub,
        address passport,
        address stamp,
        address previousCodec,
        address nextCodec
    ) {
        address governance = KyaaPassport(passport).defaultAdmin();
        if (
            !_isValidTimelock(governance) || KyaaStamp(stamp).defaultAdmin() != governance
                || !KyaaPassport(passport).hasRole(keccak256("MINTER_ROLE"), expectedHub)
                || !KyaaStamp(stamp).hasRole(keccak256("MINTER_ROLE"), expectedHub)
                || ByUsActionHub(expectedHub).getAssetBinding(2, CredentialKind.PASSPORT)
                    != passport
                || ByUsActionHub(expectedHub).getAssetBinding(2, CredentialKind.STAMP) != stamp
                || previousCodec.codehash != PREVIOUS_CODEC_CODEHASH
                || nextCodec.codehash != CODEC_CODEHASH
        ) revert InvalidCommunityTransition();
        _expectedHub = expectedHub;
        _governance = governance;
        _kyaaPassport = passport;
        _kyaaStamp = stamp;
        _previousCodec = previousCodec;
        _nextCodec = nextCodec;
    }

    function initializeCommunityCodec()
        external
        onlyProxy
        onlyRole(DEFAULT_ADMIN_ROLE)
        reinitializer(4)
    {
        HubStorage storage $ = _getStorage();
        if (
            address(this) != _expectedHub || msg.sender != _governance
                || address($.codec) != _previousCodec
                || _previousCodec.codehash != PREVIOUS_CODEC_CODEHASH
                || _nextCodec.codehash != CODEC_CODEHASH
        ) revert InvalidCommunityTransition();
        $.codec = ByUsActionCodec(_nextCodec);
    }

    function getAssetBinding(uint32 version, CredentialKind kind)
        public
        view
        override
        returns (address)
    {
        if (version != 2) return super.getAssetBinding(version, kind);
        if (_getInitializedVersion() < 3) return address(0);
        if (kind == CredentialKind.PASSPORT) return _kyaaPassport;
        if (kind == CredentialKind.STAMP) return _kyaaStamp;
        return address(0);
    }
}
