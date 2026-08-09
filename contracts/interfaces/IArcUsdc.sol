// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IArcUsdc {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}
