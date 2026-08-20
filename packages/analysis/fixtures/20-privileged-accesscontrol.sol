// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract PrivilegedAccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    mapping(bytes32 => mapping(address => bool)) private roles;

    modifier onlyRole(bytes32 role) {
        require(roles[role][msg.sender], "missing role");
        _;
    }

    function setConfig(uint256 value) external onlyRole(ADMIN_ROLE) {
        value;
    }
}
