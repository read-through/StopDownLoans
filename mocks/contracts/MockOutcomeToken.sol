// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockOutcomeToken {
    uint256 public lastLoanId;
    address public lastBorrower;
    uint256 public lastBorrowerCollateralAmount;
    bytes32 public lastMarketId;
    bytes32 public lastActivatedMarketId;
    bytes32 public lastCancelledMarketId;
    bytes32 public lastResolvedMarketId;
    uint8 public lastWinningOutcome;
    address public lastCaller;
    bool public shouldRevertActivation;

    function createProtoMarket(
        uint256 loanId,
        address borrower,
        uint256 borrowerCollateralAmount,
        bytes32 marketId
    ) external {
        lastLoanId = loanId;
        lastBorrower = borrower;
        lastBorrowerCollateralAmount = borrowerCollateralAmount;
        lastMarketId = marketId;
        lastCaller = msg.sender;
    }

    function setShouldRevertActivation(bool shouldRevertActivation_) external {
        shouldRevertActivation = shouldRevertActivation_;
    }

    function activateMarket(bytes32 marketId) external {
        require(!shouldRevertActivation, "activation failed");

        lastActivatedMarketId = marketId;
        lastCaller = msg.sender;
    }

    function cancelMarket(bytes32 marketId) external {
        lastCancelledMarketId = marketId;
        lastCaller = msg.sender;
    }

    function resolveMarket(bytes32 marketId, uint8 winningOutcome) external {
        lastResolvedMarketId = marketId;
        lastWinningOutcome = winningOutcome;
        lastCaller = msg.sender;
    }
}
