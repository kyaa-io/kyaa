// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "../lib/openzeppelin-contracts/contracts/token/ERC1155/ERC1155.sol";

/// @dev Each token number is the unsigned integer representation of a public record UUID.
contract KyaaChemiRecord is ERC1155 {
    error Unauthorized();
    error InvalidBatch();
    error NonTransferable();

    address public immutable timelock;
    address public writer;
    mapping(uint256 => bool) public issued;
    mapping(uint256 => address) private holder;

    constructor(address admin, address initialWriter, string memory metadataTemplate)
        ERC1155(metadataTemplate)
    {
        if (admin == address(0) || initialWriter == address(0)) revert Unauthorized();
        timelock = admin;
        writer = initialWriter;
    }

    function setWriter(address next) external {
        if (msg.sender != timelock) revert Unauthorized();
        writer = next;
    }

    function mintBatch(uint128[] calldata ids, address[] calldata recipients) external {
        if (msg.sender != writer) revert Unauthorized();
        if (ids.length != recipients.length || ids.length > 100) revert InvalidBatch();
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (issued[id]) continue;
            if (id == 0 || recipients[i] == address(0)) revert InvalidBatch();
            issued[id] = true;
            holder[id] = recipients[i];
            _mint(recipients[i], id, 1, "");
        }
    }

    function burnBatch(uint128[] calldata ids) external {
        if (msg.sender != writer) revert Unauthorized();
        if (ids.length > 100) revert InvalidBatch();
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            address owner = holder[id];
            // Also tombstone a record whose cancellation arrived before issuance.
            issued[id] = true;
            if (owner == address(0)) continue;
            delete holder[id];
            _burn(owner, id, 1);
        }
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert NonTransferable();
    }

    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public pure override
    {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert NonTransferable();
    }
}
