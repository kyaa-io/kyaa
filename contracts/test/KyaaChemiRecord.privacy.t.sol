// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KyaaChemiRecord} from "../src/KyaaChemiRecord.sol";

contract KyaaChemiRecordTest {
    function testReplayAndBurn() external {
        KyaaChemiRecord token = new KyaaChemiRecord(address(this), address(this), "/records/{id}");
        uint128[] memory ids = new uint128[](1);
        ids[0] = 1;
        address[] memory recipients = new address[](1);
        recipients[0] = address(0x123);
        token.mintBatch(ids, recipients);
        token.mintBatch(ids, recipients);
        require(token.balanceOf(recipients[0], 1) == 1);
        token.burnBatch(ids);
        token.burnBatch(ids);
        token.mintBatch(ids, recipients);
        require(token.issued(1) && token.balanceOf(recipients[0], 1) == 0);
    }
}
