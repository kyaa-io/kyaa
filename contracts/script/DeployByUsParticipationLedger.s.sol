// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { ByUsParticipationLedger } from "../src/ByUsParticipationLedger.sol";

contract DeployByUsParticipationLedger is Script {
    // Existing ActionHub uses ERC-7201 private role storage, without a hasRole getter.
    function hubRole(address hub, bytes32 role, address account) private view returns (bool) {
        uint256 rolesSlot = 0x9b4561162b6d58cdaee430aa4073a2ec544ff4ca21320ef4e942bd0b419f7700 + 9;
        bytes32 outer = keccak256(abi.encode(role, rolesSlot));
        return uint256(vm.load(hub, keccak256(abi.encode(account, outer)))) == 1;
    }

    function run() external returns (ByUsParticipationLedger ledger) {
        require(block.chainid == 91342, "GIWA Sepolia only");
        address admin = vm.envAddress("BYUS_ADMIN_ADDRESS");
        address recorder = vm.envAddress("BYUS_RELAYER_ADDRESS");
        uint256 key = vm.envUint("GIWA_RELAYER_PRIVATE_KEY");
        require(recorder == vm.addr(key), "Recorder must match relayer key");
        address hub = vm.envAddress("BYUS_ACTION_HUB_CONTRACT_ADDRESS");
        require(hub.code.length > 0 && hubRole(hub, bytes32(0), admin), "Existing Hub governance required");
        require(hubRole(hub, keccak256("WRITER_ROLE"), recorder), "Existing Hub writer required");
        vm.startBroadcast(key);
        ledger = new ByUsParticipationLedger(admin, recorder);
        vm.stopBroadcast();
    }
}
