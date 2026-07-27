// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IExchangeOutcomeToken {
    function markets(bytes32 marketId) external view returns (
        uint256 loanId,
        address borrower,
        uint256 borrowerCollateralAmount,
        uint8 winningOutcome,
        uint8 state
    );

    function getOutcomeTokenId(bytes32 marketId, uint8 outcome) external pure returns (uint256);
}

contract OutcomeExchange is EIP712, Ownable2Step {
    enum Side {
        Buy,
        Sell
    }

    enum Outcome {
        Yes,
        No
    }

    struct Order {
        address maker;
        address outcomeToken;
        bytes32 marketId;
        Outcome outcome;
        Side side;
        uint256 outcomeAmount;
        uint256 usdcAmount;
        uint256 expiration;
        uint256 nonce;
    }

    struct MatchContext {
        bytes32 takerOrderHash;
        uint256 tokenId;
        uint256 totalOutcomeAmount;
        uint256 totalUsdcAmount;
    }

    struct MakerMatchResult {
        bytes32 orderHash;
        uint256 filledAmount;
        uint256 usdcFillAmount;
    }

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address outcomeToken,bytes32 marketId,uint8 outcome,uint8 side,uint256 outcomeAmount,uint256 usdcAmount,uint256 expiration,uint256 nonce)"
    );

    IERC20 public immutable usdc;

    mapping(address => bool) public operators;
    mapping(bytes32 => uint256) public filledAmounts;

    event OperatorUpdated(address indexed operator, bool allowed);
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed counterparty,
        uint256 outcomeFillAmount,
        uint256 usdcFillAmount,
        uint256 totalFilledAmount,
        uint256 remainingAmount
    );
    event OrdersMatched(
        bytes32 indexed takerOrderHash,
        address indexed operator,
        uint256 totalOutcomeAmount,
        uint256 totalUsdcAmount
    );

    error InvalidAmount();
    error InvalidSignature();
    error OrderExpired();
    error OrderOverfilled();
    error ZeroAddress();
    error TransferFailed();
    error MarketNotActive();
    error NotOperator();
    error NoMakerOrders();
    error MismatchedArrayLengths();
    error MismatchedOrders();
    error NotCrossing();

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    constructor(address usdc_, address initialOwner) EIP712("StopDownOutcomeExchange", "1") Ownable(initialOwner) {
        if (usdc_ == address(0)) revert ZeroAddress();

        usdc = IERC20(usdc_);
        operators[initialOwner] = true;
        emit OperatorUpdated(initialOwner, true);
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();

        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    function matchOrders(
        Order calldata takerOrder,
        bytes calldata takerSignature,
        Order[] calldata makerOrders,
        bytes[] calldata makerSignatures,
        uint256[] calldata makerFillAmounts
    ) external onlyOperator {
        if (makerOrders.length == 0) revert NoMakerOrders();
        if (makerOrders.length != makerSignatures.length || makerOrders.length != makerFillAmounts.length) {
            revert MismatchedArrayLengths();
        }
        if (!_isMarketActive(takerOrder.outcomeToken, takerOrder.marketId)) revert MarketNotActive();

        MatchContext memory context;
        context.takerOrderHash = _validateOrder(takerOrder, takerSignature);
        context.tokenId = IExchangeOutcomeToken(takerOrder.outcomeToken).getOutcomeTokenId(
            takerOrder.marketId,
            takerOrder.outcome == Outcome.Yes ? 1 : 2
        );

        for (uint256 i = 0; i < makerOrders.length; ++i) {
            uint256 fillAmount = makerFillAmounts[i];
            context.totalOutcomeAmount += fillAmount;
            context.totalUsdcAmount += _matchMakerOrder(
                takerOrder,
                makerOrders[i],
                makerSignatures[i],
                fillAmount,
                context
            );
        }

        _emitTakerMatch(takerOrder, context);
    }

    function hashOrder(Order calldata order) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.outcomeToken,
                order.marketId,
                order.outcome,
                order.side,
                order.outcomeAmount,
                order.usdcAmount,
                order.expiration,
                order.nonce
            )
        );
    }

    function _validateOrder(Order calldata order, bytes calldata signature) private view returns (bytes32 orderHash) {
        if (order.maker == address(0) || order.outcomeToken == address(0)) revert ZeroAddress();
        if (order.outcomeAmount == 0 || order.usdcAmount == 0) revert InvalidAmount();
        if (block.timestamp > order.expiration) revert OrderExpired();

        orderHash = hashOrder(order);
        if (ECDSA.recover(_hashTypedDataV4(orderHash), signature) != order.maker) revert InvalidSignature();
    }

    function _validateMatch(Order calldata takerOrder, Order calldata makerOrder) private pure {
        if (
            takerOrder.outcomeToken != makerOrder.outcomeToken
                || takerOrder.marketId != makerOrder.marketId
                || takerOrder.outcome != makerOrder.outcome
                || takerOrder.side == makerOrder.side
        ) revert MismatchedOrders();

        if (takerOrder.side == Side.Buy) {
            if (
                Math.mulDiv(takerOrder.usdcAmount, makerOrder.outcomeAmount, takerOrder.outcomeAmount)
                    < makerOrder.usdcAmount
            ) revert NotCrossing();
        } else if (
            Math.mulDiv(makerOrder.usdcAmount, takerOrder.outcomeAmount, makerOrder.outcomeAmount)
                < takerOrder.usdcAmount
        ) {
            revert NotCrossing();
        }
    }

    function _matchMakerOrder(
        Order calldata takerOrder,
        Order calldata makerOrder,
        bytes calldata makerSignature,
        uint256 fillAmount,
        MatchContext memory context
    ) private returns (uint256 usdcFillAmount) {
        MakerMatchResult memory result;
        result.orderHash = _validateOrder(makerOrder, makerSignature);
        _validateMatch(takerOrder, makerOrder);

        _consumeOrder(context.takerOrderHash, takerOrder.outcomeAmount, fillAmount);
        uint256 previousMakerFilledAmount;
        (result.filledAmount, previousMakerFilledAmount) =
            _consumeOrderWithPrevious(result.orderHash, makerOrder.outcomeAmount, fillAmount);
        result.usdcFillAmount = _cumulativeUsdcFill(makerOrder, previousMakerFilledAmount, result.filledAmount);

        _settleMatch(takerOrder, makerOrder, context.tokenId, fillAmount, result.usdcFillAmount);
        _emitMakerFill(takerOrder, makerOrder, fillAmount, result);

        return result.usdcFillAmount;
    }

    function _emitMakerFill(
        Order calldata takerOrder,
        Order calldata makerOrder,
        uint256 fillAmount,
        MakerMatchResult memory result
    ) private {
        emit OrderFilled(
            result.orderHash,
            makerOrder.maker,
            takerOrder.maker,
            fillAmount,
            result.usdcFillAmount,
            result.filledAmount,
            makerOrder.outcomeAmount - result.filledAmount
        );
    }

    function _emitTakerMatch(Order calldata takerOrder, MatchContext memory context) private {
        uint256 takerFilledAmount = filledAmounts[context.takerOrderHash];
        emit OrderFilled(
            context.takerOrderHash,
            takerOrder.maker,
            address(this),
            context.totalOutcomeAmount,
            context.totalUsdcAmount,
            takerFilledAmount,
            takerOrder.outcomeAmount - takerFilledAmount
        );
        emit OrdersMatched(
            context.takerOrderHash,
            msg.sender,
            context.totalOutcomeAmount,
            context.totalUsdcAmount
        );
    }

    function _consumeOrder(bytes32 orderHash, uint256 orderAmount, uint256 fillAmount)
        private
        returns (uint256 newFilledAmount)
    {
        (newFilledAmount,) = _consumeOrderWithPrevious(orderHash, orderAmount, fillAmount);
    }

    function _consumeOrderWithPrevious(bytes32 orderHash, uint256 orderAmount, uint256 fillAmount)
        private
        returns (uint256 newFilledAmount, uint256 previousFilledAmount)
    {
        if (fillAmount == 0) revert InvalidAmount();

        previousFilledAmount = filledAmounts[orderHash];
        newFilledAmount = previousFilledAmount + fillAmount;
        if (newFilledAmount > orderAmount) revert OrderOverfilled();

        filledAmounts[orderHash] = newFilledAmount;
    }

    function _cumulativeUsdcFill(
        Order calldata order,
        uint256 previousFilledAmount,
        uint256 newFilledAmount
    ) private pure returns (uint256 usdcFillAmount) {
        usdcFillAmount = Math.mulDiv(order.usdcAmount, newFilledAmount, order.outcomeAmount)
            - Math.mulDiv(order.usdcAmount, previousFilledAmount, order.outcomeAmount);
        if (usdcFillAmount == 0) revert InvalidAmount();
    }

    function _settleMatch(
        Order calldata takerOrder,
        Order calldata makerOrder,
        uint256 tokenId,
        uint256 outcomeFillAmount,
        uint256 usdcFillAmount
    ) private {
        if (takerOrder.side == Side.Buy) {
            IERC1155(takerOrder.outcomeToken).safeTransferFrom(
                makerOrder.maker,
                takerOrder.maker,
                tokenId,
                outcomeFillAmount,
                ""
            );
            if (!usdc.transferFrom(takerOrder.maker, makerOrder.maker, usdcFillAmount)) revert TransferFailed();
        } else {
            IERC1155(takerOrder.outcomeToken).safeTransferFrom(
                takerOrder.maker,
                makerOrder.maker,
                tokenId,
                outcomeFillAmount,
                ""
            );
            if (!usdc.transferFrom(makerOrder.maker, takerOrder.maker, usdcFillAmount)) revert TransferFailed();
        }
    }

    function _isMarketActive(address outcomeToken, bytes32 marketId) private view returns (bool) {
        (, , , , uint8 state) = IExchangeOutcomeToken(outcomeToken).markets(marketId);
        return state == 1;
    }
}
