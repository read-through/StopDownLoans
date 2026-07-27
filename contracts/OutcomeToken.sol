// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

interface IOutcomeCollateral {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract OutcomeToken is ERC1155 {
    enum MarketState {
        Proto,
        Active,
        Cancelled,
        Resolved
    }

    enum WinningOutcome {
        None,
        Yes,
        No
    }

    struct Market {
        uint256 loanId;
        address borrower;
        uint256 borrowerCollateralAmount;
        WinningOutcome winningOutcome;
        MarketState state;
    }

    struct MarketView {
        uint256 loanId;
        address borrower;
        uint256 borrowerCollateralAmount;
        uint256 borrowerCollateralDepositedAmount;
        WinningOutcome winningOutcome;
        MarketState state;
        uint256 yesTokenId;
        uint256 noTokenId;
    }

    address public immutable loanPositionToken;
    IOutcomeCollateral public immutable collateralToken;

    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => mapping(address => uint256)) public pendingPairCollateral;
    mapping(bytes32 => mapping(address => uint256)) public pairCollateralMinted;
    mapping(bytes32 => uint256) public borrowerCollateralDeposited;

    event ProtoMarketCreated(
        bytes32 indexed marketId,
        uint256 indexed loanId,
        address indexed borrower,
        uint256 borrowerCollateralAmount
    );
    event BorrowerCollateralDeposited(bytes32 indexed marketId, address indexed borrower, uint256 amount);
    event PairCollateralDeposited(bytes32 indexed marketId, address indexed depositor, uint256 amount);
    event PairDepositWithdrawn(bytes32 indexed marketId, address indexed depositor, uint256 amount);
    event MarketActivated(bytes32 indexed marketId, uint256 borrowerCollateralAmount);
    event MarketCancelled(bytes32 indexed marketId);
    event BorrowerCollateralRefunded(bytes32 indexed marketId, address indexed borrower, uint256 amount);
    event PairCollateralRefunded(bytes32 indexed marketId, address indexed depositor, uint256 amount);
    event ActivatedPairMinted(bytes32 indexed marketId, address indexed depositor, uint256 amount);
    event PositionsMerged(bytes32 indexed marketId, address indexed holder, uint256 amount);
    event MarketResolved(bytes32 indexed marketId, WinningOutcome winningOutcome);
    event OutcomeRedeemed(
        bytes32 indexed marketId,
        address indexed redeemer,
        WinningOutcome indexed winningOutcome,
        uint256 amount
    );

    error NotLoanPositionToken();
    error MarketAlreadyExists();
    error NotProto();
    error NotActive();
    error NotCancelled();
    error NotResolved();
    error NotBorrower();
    error InvalidOutcome();
    error BorrowerCollateralIncomplete();
    error BorrowerCollateralExceedsRequired();
    error InsufficientUnmintedPairDeposit();
    error NothingToClaim();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    constructor(address loanPositionToken_, address collateralToken_, string memory uri_) ERC1155(uri_) {
        if (loanPositionToken_ == address(0)) revert ZeroAddress();
        if (collateralToken_ == address(0)) revert ZeroAddress();

        loanPositionToken = loanPositionToken_;
        collateralToken = IOutcomeCollateral(collateralToken_);
    }

    function createProtoMarket(
        uint256 loanId,
        address borrower,
        uint256 borrowerCollateralAmount,
        bytes32 marketId
    ) external {
        if (msg.sender != loanPositionToken) revert NotLoanPositionToken();
        if (markets[marketId].borrower != address(0)) revert MarketAlreadyExists();

        markets[marketId] = Market({
            loanId: loanId,
            borrower: borrower,
            borrowerCollateralAmount: borrowerCollateralAmount,
            winningOutcome: WinningOutcome.None,
            state: MarketState.Proto
        });

        emit ProtoMarketCreated(marketId, loanId, borrower, borrowerCollateralAmount);
    }

    function depositBorrowerCollateral(bytes32 marketId, uint256 amount) external {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Proto) revert NotProto();
        if (msg.sender != market.borrower) revert NotBorrower();
        if (amount == 0) revert ZeroAmount();
        if (borrowerCollateralDeposited[marketId] + amount > market.borrowerCollateralAmount) {
            revert BorrowerCollateralExceedsRequired();
        }

        borrowerCollateralDeposited[marketId] += amount;

        if (!collateralToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        emit BorrowerCollateralDeposited(marketId, msg.sender, amount);
    }

    function depositPairCollateral(bytes32 marketId, uint256 amount) external {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Proto && market.state != MarketState.Active) revert NotProto();
        if (amount == 0) revert ZeroAmount();

        pendingPairCollateral[marketId][msg.sender] += amount;

        if (!collateralToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        emit PairCollateralDeposited(marketId, msg.sender, amount);
    }

    function withdrawPairDeposit(bytes32 marketId, uint256 amount) external {
        Market storage market = markets[marketId];
        if (
            market.state != MarketState.Proto &&
            market.state != MarketState.Active &&
            market.state != MarketState.Resolved
        ) {
            revert NotProto();
        }
        if (amount == 0) revert ZeroAmount();

        uint256 unmintedAmount = pendingPairCollateral[marketId][msg.sender] - pairCollateralMinted[marketId][msg.sender];
        if (amount > unmintedAmount) revert InsufficientUnmintedPairDeposit();

        pendingPairCollateral[marketId][msg.sender] -= amount;

        if (!collateralToken.transfer(msg.sender, amount)) revert TransferFailed();

        emit PairDepositWithdrawn(marketId, msg.sender, amount);
    }

    function activateMarket(bytes32 marketId) external {
        if (msg.sender != loanPositionToken) revert NotLoanPositionToken();

        Market storage market = markets[marketId];
        if (market.state != MarketState.Proto) revert NotProto();
        if (borrowerCollateralDeposited[marketId] < market.borrowerCollateralAmount) {
            revert BorrowerCollateralIncomplete();
        }

        market.state = MarketState.Active;

        _mint(market.borrower, getYesTokenId(marketId), market.borrowerCollateralAmount, "");
        _mint(loanPositionToken, getNoTokenId(marketId), market.borrowerCollateralAmount, "");

        emit MarketActivated(marketId, market.borrowerCollateralAmount);
    }

    function cancelMarket(bytes32 marketId) external {
        if (msg.sender != loanPositionToken) revert NotLoanPositionToken();

        Market storage market = markets[marketId];
        if (market.state != MarketState.Proto) revert NotProto();

        market.state = MarketState.Cancelled;

        emit MarketCancelled(marketId);
    }

    function refundBorrowerCollateral(bytes32 marketId) external {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Cancelled) revert NotCancelled();
        if (msg.sender != market.borrower) revert NotBorrower();

        uint256 amount = borrowerCollateralDeposited[marketId];
        if (amount == 0) revert NothingToClaim();

        borrowerCollateralDeposited[marketId] = 0;

        if (!collateralToken.transfer(msg.sender, amount)) revert TransferFailed();

        emit BorrowerCollateralRefunded(marketId, msg.sender, amount);
    }

    function refundPairCollateral(bytes32 marketId) external {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Cancelled) revert NotCancelled();

        uint256 amount = pendingPairCollateral[marketId][msg.sender];
        if (amount == 0) revert NothingToClaim();

        pendingPairCollateral[marketId][msg.sender] = 0;

        if (!collateralToken.transfer(msg.sender, amount)) revert TransferFailed();

        emit PairCollateralRefunded(marketId, msg.sender, amount);
    }

    function mintActivatedPair(bytes32 marketId) external {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Active) revert NotActive();

        uint256 amount = getPairMintable(marketId, msg.sender);
        if (amount == 0) revert NothingToClaim();

        pairCollateralMinted[marketId][msg.sender] += amount;

        _mint(msg.sender, getYesTokenId(marketId), amount, "");
        _mint(msg.sender, getNoTokenId(marketId), amount, "");

        emit ActivatedPairMinted(marketId, msg.sender, amount);
    }

    function getPairMintable(bytes32 marketId, address account) public view returns (uint256) {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Active) revert NotActive();

        return _unmintedPairDeposit(marketId, account);
    }

    function getUnmintedPairDeposit(bytes32 marketId, address account) external view returns (uint256) {
        Market storage market = markets[marketId];
        if (
            market.state != MarketState.Proto &&
            market.state != MarketState.Active &&
            market.state != MarketState.Resolved
        ) {
            revert NotProto();
        }

        return _unmintedPairDeposit(marketId, account);
    }

    function getMarketView(bytes32 marketId) external view returns (MarketView memory) {
        Market storage market = markets[marketId];

        return MarketView({
            loanId: market.loanId,
            borrower: market.borrower,
            borrowerCollateralAmount: market.borrowerCollateralAmount,
            borrowerCollateralDepositedAmount: borrowerCollateralDeposited[marketId],
            winningOutcome: market.winningOutcome,
            state: market.state,
            yesTokenId: getYesTokenId(marketId),
            noTokenId: getNoTokenId(marketId)
        });
    }

    function mergePositions(bytes32 marketId, uint256 amount) external {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Active) revert NotActive();
        if (amount == 0) revert ZeroAmount();

        _burn(msg.sender, getYesTokenId(marketId), amount);
        _burn(msg.sender, getNoTokenId(marketId), amount);

        if (!collateralToken.transfer(msg.sender, amount)) revert TransferFailed();

        emit PositionsMerged(marketId, msg.sender, amount);
    }

    function resolveMarket(bytes32 marketId, WinningOutcome winningOutcome) external {
        if (msg.sender != loanPositionToken) revert NotLoanPositionToken();
        if (winningOutcome == WinningOutcome.None) revert InvalidOutcome();

        Market storage market = markets[marketId];
        if (market.state != MarketState.Active) revert NotActive();

        market.winningOutcome = winningOutcome;
        market.state = MarketState.Resolved;

        emit MarketResolved(marketId, winningOutcome);
    }

    function redeem(bytes32 marketId, WinningOutcome winningOutcome, uint256 amount) external {
        Market storage market = markets[marketId];
        if (market.state != MarketState.Resolved) revert NotResolved();
        if (winningOutcome == WinningOutcome.None || winningOutcome != market.winningOutcome) revert InvalidOutcome();
        if (amount == 0) revert ZeroAmount();

        _burn(msg.sender, getOutcomeTokenId(marketId, winningOutcome), amount);

        if (!collateralToken.transfer(msg.sender, amount)) revert TransferFailed();

        emit OutcomeRedeemed(marketId, msg.sender, winningOutcome, amount);
    }

    function getYesTokenId(bytes32 marketId) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(marketId, uint8(1))));
    }

    function getNoTokenId(bytes32 marketId) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(marketId, uint8(2))));
    }

    function getOutcomeTokenId(bytes32 marketId, WinningOutcome winningOutcome) public pure returns (uint256) {
        if (winningOutcome == WinningOutcome.Yes) return getYesTokenId(marketId);
        if (winningOutcome == WinningOutcome.No) return getNoTokenId(marketId);
        revert InvalidOutcome();
    }

    function _unmintedPairDeposit(bytes32 marketId, address account) private view returns (uint256) {
        return pendingPairCollateral[marketId][account] - pairCollateralMinted[marketId][account];
    }
}
