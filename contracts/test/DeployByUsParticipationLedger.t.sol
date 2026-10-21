// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import { Test } from "forge-std/Test.sol";
import { DeployByUsParticipationLedger } from "../script/DeployByUsParticipationLedger.s.sol";
import { ByUsParticipationLedger } from "../src/ByUsParticipationLedger.sol";

contract DeployByUsParticipationLedgerTest is Test {
    DeployByUsParticipationLedger script;
    address admin = makeAddr("existing-timelock");
    address hub = makeAddr("existing-hub");
    address recorder;
    function setHubRole(bytes32 role, address account, bool enabled) private {
        bytes32 outer=keccak256(abi.encode(role,uint256(0x9b4561162b6d58cdaee430aa4073a2ec544ff4ca21320ef4e942bd0b419f7700)+9));
        vm.store(hub,keccak256(abi.encode(account,outer)),bytes32(uint256(enabled?1:0)));
    }
    function setUp() public {
        recorder = vm.addr(1);
        vm.chainId(91342);
        vm.etch(admin, hex"00");vm.etch(hub, hex"00");
        vm.mockCall(admin, abi.encodeWithSignature("getMinDelay()"), abi.encode(uint256(2 days)));
        setHubRole(bytes32(0),admin,true);
        setHubRole(keccak256("WRITER_ROLE"),recorder,true);
        vm.setEnv("BYUS_ADMIN_ADDRESS",vm.toString(admin));
        vm.setEnv("BYUS_RELAYER_ADDRESS",vm.toString(recorder));
        vm.setEnv("BYUS_ACTION_HUB_CONTRACT_ADDRESS",vm.toString(hub));
        vm.setEnv("GIWA_RELAYER_PRIVATE_KEY","1");
        script = new DeployByUsParticipationLedger();
    }
    // Environment variables are process-global, so exercise mutations in one sequential test.
    function testDeploymentAndRejectedBindings() public {
        ByUsParticipationLedger ledger=script.run();
        assertEq(ledger.defaultAdmin(),admin);
        assertTrue(ledger.hasRole(ledger.RECORDER_ROLE(),recorder));
        vm.setEnv("BYUS_RELAYER_ADDRESS",vm.toString(address(99)));
        vm.expectRevert("Recorder must match relayer key");script.run();
        vm.setEnv("BYUS_RELAYER_ADDRESS",vm.toString(recorder));
        setHubRole(bytes32(0),admin,false);
        vm.expectRevert("Existing Hub governance required");script.run();
        setHubRole(bytes32(0),admin,true);
        vm.chainId(1);vm.expectRevert("GIWA Sepolia only");script.run();
        vm.chainId(91342);
        setHubRole(keccak256("WRITER_ROLE"),recorder,false);
        vm.expectRevert("Existing Hub writer required");script.run();
    }
}
