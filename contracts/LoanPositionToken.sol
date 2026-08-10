// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

interface ILoanAsset {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IOutcomeProtoMarket {
    function createProtoMarket(
        uint256 loanId,
        address borrower,
        uint256 borrowerCollateralAmount,
        bytes32 marketId
    ) external;

    function activateMarket(bytes32 marketId) external;

    function cancelMarket(bytes32 marketId) external;

    function resolveMarket(bytes32 marketId, uint8 winningOutcome) external;

    function redeem(bytes32 marketId, uint8 winningOutcome, uint256 amount) external;

    function getNoTokenId(bytes32 marketId) external view returns (uint256);

    function balanceOf(address account, uint256 id) external view returns (uint256);
}

contract LoanPositionToken is ERC1155, ERC1155Holder {
    enum LoanState {
        Funding,
        Funded,
        Active,
        Cancelled,
        Repaid,
        Defaulted
    }

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 repaymentAmount;
        uint256 loanWithdrawFreezeDeadline;
        uint256 activationDeadline;
        uint256 repaymentDeadline;
        uint256 fundedAmount;
        uint256 creditedAmount;
        uint256 repaymentSatisfiedAt;
        uint256 feeClaimedAmount;
        LoanState state;
    }

    struct Position {
        uint256 loanId;
        uint256 principalAmount;
        uint256 claimedAmount;
        bool split;
    }

    struct LoanView {
        address borrower;
        uint256 principal;
        uint256 repaymentAmount;
        uint256 loanWithdrawFreezeDeadline;
        uint256 activationDeadline;
        uint256 repaymentDeadline;
        uint256 fundedAmount;
        uint256 creditedAmount;
        uint256 repaymentSatisfiedAt;
        uint256 feeClaimedAmount;
        LoanState state;
        uint256 interestBps;
        uint256 feeBps;
        address feeRecipient;
        uint256 collateralBps;
        uint256 borrowerCollateralAmount;
        bytes32 marketId;
    }

    ILoanAsset public immutable usdc;
    address public owner;
    address public pendingOwner;
    uint256 public platformFeeBps;
    address public platformFeeRecipient;
    address public outcomeToken;
    uint256 public nextLoanId = 1;
    uint256 public nextPositionId = 1;

    mapping(uint256 => Loan) public loans;
    mapping(uint256 => Position) public positions;
    mapping(uint256 => uint256) public loanInterestBps;
    mapping(uint256 => uint256) public loanFeeBps;
    mapping(uint256 => address) public loanFeeRecipient;
    mapping(uint256 => uint256) public loanCollateralBps;

    event LoanCreated(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 principal,
        uint256 repaymentAmount,
        uint256 interestBps,
        uint256 loanWithdrawFreezeDeadline,
        uint256 activationDeadline,
        uint256 repaymentDeadline,
        uint256 collateralBps,
        bytes32 indexed marketId
    );
    event Activated(uint256 indexed loanId, address indexed borrower, uint256 principal);
    event LoanPaymentDeposited(uint256 indexed loanId, address indexed payer, uint256 amount);
    event Repaid(uint256 indexed loanId, uint256 creditedAmount);
    event Defaulted(uint256 indexed loanId, uint256 creditedAmount);
    event Claimed(uint256 indexed loanId, uint256 indexed positionId, address indexed recipient, uint256 amount);
    event PlatformFeeClaimed(uint256 indexed loanId, address indexed recipient, uint256 amount);
    event DefaultCollateralRedeemed(uint256 indexed loanId, bytes32 indexed marketId, uint256 amount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event PlatformFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event OutcomeTokenUpdated(address indexed oldOutcomeToken, address indexed newOutcomeToken);
    event Cancelled(uint256 indexed loanId);
    event BorrowerCollateralRefundPending(uint256 indexed loanId, address indexed borrower);
    event PositionSplit(
        uint256 indexed originalPositionId,
        uint256 indexed newPositionId,
        uint256 splitPrincipalAmount,
        uint256 splitClaimedAmount
    );
    event Funded(
        uint256 indexed loanId,
        uint256 indexed positionId,
        address indexed lender,
        uint256 acceptedAmount,
        uint256 unusedAmount
    );

    error NotFunding();
    error NotFunded();
    error NotActive();
    error NotDefaulted();
    error NotOwner();
    error NotPendingOwner();
    error NotSettled();
    error NotPositionOwner();
    error NothingToClaim();
    error NotCancellable();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidAmount();
    error InvalidDeadline();
    error OutcomeTokenNotSet();
    error OutcomeTokenAlreadySet();
    error LoanWithdrawFreezeDeadlinePassed();
    error LoanWithdrawFreezeDeadlineNotPassed();
    error ActivationDeadlinePassed();
    error ActivationDeadlineNotPassed();
    error RepaymentDeadlinePassed();
    error RepaymentDeadlineNotPassed();
    error InsufficientRepayment();
    error RepaymentAvailable();
    error TransferFailed();

    constructor(address usdc_, address owner_, uint256 platformFeeBps_, address platformFeeRecipient_, string memory uri_) ERC1155(uri_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (owner_ == address(0)) revert ZeroAddress();
        if (platformFeeRecipient_ == address(0)) revert ZeroAddress();
        if (platformFeeBps_ > 10_000) revert InvalidAmount();

        usdc = ILoanAsset(usdc_);
        owner = owner_;
        platformFeeBps = platformFeeBps_;
        platformFeeRecipient = platformFeeRecipient_;
    }

    function createLoan(
        uint256 principal,
        uint256 interestBps,
        uint256 collateralBps,
        uint256 loanWithdrawFreezeDeadline,
        uint256 activationDeadline,
        uint256 repaymentDeadline
    ) external returns (uint256 loanId) {
        if (principal == 0) revert ZeroAmount();
        if (collateralBps == 0) revert InvalidAmount();
        if (outcomeToken == address(0)) revert OutcomeTokenNotSet();
        if (loanWithdrawFreezeDeadline <= block.timestamp) revert InvalidDeadline();
        if (activationDeadline <= block.timestamp) revert InvalidDeadline();
        if (loanWithdrawFreezeDeadline > activationDeadline) revert InvalidDeadline();
        if (repaymentDeadline <= activationDeadline) revert InvalidDeadline();

        loanId = nextLoanId;
        nextLoanId++;
        uint256 repaymentAmount = principal + ((principal * interestBps) / 10_000);
        bytes32 marketId = getMarketId(loanId);

        Loan storage loan = loans[loanId];
        loan.borrower = msg.sender;
        loan.principal = principal;
        loan.repaymentAmount = repaymentAmount;
        loan.loanWithdrawFreezeDeadline = loanWithdrawFreezeDeadline;
        loan.activationDeadline = activationDeadline;
        loan.repaymentDeadline = repaymentDeadline;
        loan.state = LoanState.Funding;

        loanInterestBps[loanId] = interestBps;
        loanFeeBps[loanId] = platformFeeBps;
        loanFeeRecipient[loanId] = platformFeeRecipient;
        loanCollateralBps[loanId] = collateralBps;

        IOutcomeProtoMarket(outcomeToken).createProtoMarket(
            loanId,
            msg.sender,
            getBorrowerCollateralAmount(loanId),
            marketId
        );

        _emitLoanCreated(loanId, msg.sender, marketId);
    }

    function _emitLoanCreated(uint256 loanId, address borrower, bytes32 marketId) internal {
        Loan storage loan = loans[loanId];

        emit LoanCreated(
            loanId,
            borrower,
            loan.principal,
            loan.repaymentAmount,
            loanInterestBps[loanId],
            loan.loanWithdrawFreezeDeadline,
            loan.activationDeadline,
            loan.repaymentDeadline,
            loanCollateralBps[loanId],
            marketId
        );
    }

    function getMarketId(uint256 loanId) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), loanId));
    }

    function getBorrowerCollateralAmount(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        return (loan.principal * loanCollateralBps[loanId]) / 10_000;
    }

    function getLoanView(uint256 loanId) external view returns (LoanView memory) {
        Loan storage loan = loans[loanId];

        return LoanView({
            borrower: loan.borrower,
            principal: loan.principal,
            repaymentAmount: loan.repaymentAmount,
            loanWithdrawFreezeDeadline: loan.loanWithdrawFreezeDeadline,
            activationDeadline: loan.activationDeadline,
            repaymentDeadline: loan.repaymentDeadline,
            fundedAmount: loan.fundedAmount,
            creditedAmount: loan.creditedAmount,
            repaymentSatisfiedAt: loan.repaymentSatisfiedAt,
            feeClaimedAmount: loan.feeClaimedAmount,
            state: loan.state,
            interestBps: loanInterestBps[loanId],
            feeBps: loanFeeBps[loanId],
            feeRecipient: loanFeeRecipient[loanId],
            collateralBps: loanCollateralBps[loanId],
            borrowerCollateralAmount: getBorrowerCollateralAmount(loanId),
            marketId: getMarketId(loanId)
        });
    }

    function setPlatformFeeBps(uint256 newFeeBps) external {
        if (msg.sender != owner) revert NotOwner();
        if (newFeeBps > 10_000) revert InvalidAmount();

        uint256 oldFeeBps = platformFeeBps;
        platformFeeBps = newFeeBps;

        emit PlatformFeeUpdated(oldFeeBps, newFeeBps);
    }

    function setOutcomeToken(address newOutcomeToken) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOutcomeToken == address(0)) revert ZeroAddress();
        if (outcomeToken != address(0)) revert OutcomeTokenAlreadySet();

        address oldOutcomeToken = outcomeToken;
        outcomeToken = newOutcomeToken;

        emit OutcomeTokenUpdated(oldOutcomeToken, newOutcomeToken);
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();

        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();

        address oldOwner = owner;
        address newOwner = pendingOwner;
        owner = newOwner;
        pendingOwner = address(0);

        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setPlatformFeeRecipient(address newRecipient) external {
        if (msg.sender != owner) revert NotOwner();
        if (newRecipient == address(0)) revert ZeroAddress();

        address oldRecipient = platformFeeRecipient;
        platformFeeRecipient = newRecipient;

        emit PlatformFeeRecipientUpdated(oldRecipient, newRecipient);
    }

    function fund(uint256 loanId, uint256 amount) external returns (uint256 positionId) {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Funding) revert NotFunding();
        if (block.timestamp >= loan.activationDeadline) revert ActivationDeadlinePassed();
        if (amount == 0) revert ZeroAmount();

        uint256 remaining = loan.principal - loan.fundedAmount;
        uint256 acceptedAmount = amount > remaining ? remaining : amount;
        uint256 unusedAmount = amount - acceptedAmount;

        loan.fundedAmount += acceptedAmount;

        positionId = nextPositionId;
        nextPositionId++;

        positions[positionId] = Position({
            loanId: loanId,
            principalAmount: acceptedAmount,
            claimedAmount: 0,
            split: false
        });

        if (!usdc.transferFrom(msg.sender, address(this), acceptedAmount)) revert TransferFailed();

        _mint(msg.sender, positionId, 1, "");

        if (loan.fundedAmount == loan.principal) {
            loan.state = LoanState.Funded;
        }

        emit Funded(loanId, positionId, msg.sender, acceptedAmount, unusedAmount);
    }

    function activate(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Funded) revert NotFunded();
        if (block.timestamp < loan.loanWithdrawFreezeDeadline) revert LoanWithdrawFreezeDeadlineNotPassed();
        if (block.timestamp > loan.activationDeadline) revert ActivationDeadlinePassed();
        if (outcomeToken == address(0)) revert OutcomeTokenNotSet();

        IOutcomeProtoMarket(outcomeToken).activateMarket(getMarketId(loanId));

        if (!usdc.transfer(loan.borrower, loan.principal)) revert TransferFailed();

        loan.state = LoanState.Active;

        emit Activated(loanId, loan.borrower, loan.principal);
    }

    function depositToLoan(uint256 loanId, uint256 amount) external {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Active && loan.state != LoanState.Repaid && loan.state != LoanState.Defaulted) {
            revert NotActive();
        }
        if (loan.state == LoanState.Active && block.timestamp > loan.repaymentDeadline) {
            revert RepaymentDeadlinePassed();
        }
        if (amount == 0) revert ZeroAmount();

        loan.creditedAmount += amount;
        if (
            loan.state == LoanState.Active &&
            loan.repaymentSatisfiedAt == 0 &&
            loan.creditedAmount >= loan.repaymentAmount
        ) {
            loan.repaymentSatisfiedAt = block.timestamp;
        }

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        emit LoanPaymentDeposited(loanId, msg.sender, amount);
    }

    function settleRepaid(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Active) revert NotActive();
        if (loan.repaymentSatisfiedAt == 0) revert InsufficientRepayment();
        if (loan.repaymentSatisfiedAt > loan.repaymentDeadline) revert RepaymentDeadlinePassed();
        if (outcomeToken == address(0)) revert OutcomeTokenNotSet();

        loan.state = LoanState.Repaid;

        IOutcomeProtoMarket(outcomeToken).resolveMarket(getMarketId(loanId), 1);

        emit Repaid(loanId, loan.creditedAmount);
    }

    function cancelExpiredLoan(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Funding && loan.state != LoanState.Funded) revert NotCancellable();
        if (block.timestamp <= loan.activationDeadline) revert ActivationDeadlineNotPassed();
        if (outcomeToken == address(0)) revert OutcomeTokenNotSet();

        loan.state = LoanState.Cancelled;

        IOutcomeProtoMarket(outcomeToken).cancelMarket(getMarketId(loanId));

        emit Cancelled(loanId);
        emit BorrowerCollateralRefundPending(loanId, loan.borrower);
    }

    function markDefaulted(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Active) revert NotActive();
        if (block.timestamp <= loan.repaymentDeadline) revert RepaymentDeadlineNotPassed();
        if (loan.repaymentSatisfiedAt != 0 && loan.repaymentSatisfiedAt <= loan.repaymentDeadline) {
            revert RepaymentAvailable();
        }
        if (outcomeToken == address(0)) revert OutcomeTokenNotSet();

        loan.state = LoanState.Defaulted;

        IOutcomeProtoMarket(outcomeToken).resolveMarket(getMarketId(loanId), 2);

        emit Defaulted(loanId, loan.creditedAmount);
    }

    function redeemDefaultCollateral(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Defaulted) revert NotDefaulted();
        if (outcomeToken == address(0)) revert OutcomeTokenNotSet();

        bytes32 marketId = getMarketId(loanId);
        IOutcomeProtoMarket market = IOutcomeProtoMarket(outcomeToken);
        uint256 noTokenId = market.getNoTokenId(marketId);
        uint256 amount = market.balanceOf(address(this), noTokenId);
        if (amount == 0) revert NothingToClaim();

        market.redeem(marketId, 2, amount);
        loan.creditedAmount += amount;

        emit DefaultCollateralRedeemed(loanId, marketId, amount);
    }

    function claim(uint256 positionId) external {
        Position storage position = positions[positionId];
        Loan storage loan = loans[position.loanId];

        if (loan.state == LoanState.Funding || loan.state == LoanState.Funded) {
            _claimFundingPrincipal(positionId, position, loan);
            return;
        }

        if (
            loan.state != LoanState.Cancelled &&
            loan.state != LoanState.Repaid &&
            loan.state != LoanState.Defaulted
        ) {
            revert NotSettled();
        }
        if (balanceOf(msg.sender, positionId) != 1) revert NotPositionOwner();

        uint256 totalEntitlement = loan.state == LoanState.Cancelled
            ? position.principalAmount
            : (_lenderPayoutPool(position.loanId, loan) * position.principalAmount) / loan.fundedAmount;
        uint256 amount = totalEntitlement - position.claimedAmount;
        if (amount == 0) revert NothingToClaim();

        position.claimedAmount += amount;

        if (loan.state == LoanState.Cancelled) {
            _burn(msg.sender, positionId, 1);
        }

        if (!usdc.transfer(msg.sender, amount)) revert TransferFailed();

        emit Claimed(position.loanId, positionId, msg.sender, amount);
    }

    function getClaimable(uint256 positionId) external view returns (uint256) {
        Position storage position = positions[positionId];
        Loan storage loan = loans[position.loanId];

        if (loan.state == LoanState.Funding || loan.state == LoanState.Funded) {
            if (block.timestamp >= loan.loanWithdrawFreezeDeadline) revert LoanWithdrawFreezeDeadlinePassed();
            if (balanceOf(msg.sender, positionId) != 1) revert NotPositionOwner();

            uint256 fundingAmount = position.principalAmount - position.claimedAmount;
            if (fundingAmount == 0) revert NothingToClaim();

            return fundingAmount;
        }

        if (
            loan.state != LoanState.Cancelled &&
            loan.state != LoanState.Repaid &&
            loan.state != LoanState.Defaulted
        ) {
            revert NotSettled();
        }
        if (balanceOf(msg.sender, positionId) != 1) revert NotPositionOwner();

        uint256 totalEntitlement = loan.state == LoanState.Cancelled
            ? position.principalAmount
            : (_lenderPayoutPool(position.loanId, loan) * position.principalAmount) / loan.fundedAmount;
        uint256 amount = totalEntitlement - position.claimedAmount;
        if (amount == 0) revert NothingToClaim();

        return amount;
    }

    function claimPlatformFee(uint256 loanId) external {
        if (msg.sender != owner) revert NotOwner();

        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Repaid && loan.state != LoanState.Defaulted) revert NotSettled();

        uint256 totalFee = _totalProtocolFee(loanId, loan);
        uint256 amount = totalFee - loan.feeClaimedAmount;
        if (amount == 0) revert NothingToClaim();

        loan.feeClaimedAmount += amount;

        address feeRecipient = loanFeeRecipient[loanId];
        if (!usdc.transfer(feeRecipient, amount)) revert TransferFailed();

        emit PlatformFeeClaimed(loanId, feeRecipient, amount);
    }

    function splitPosition(uint256 positionId, uint256 splitPrincipalAmount) external returns (uint256 newPositionId) {
        if (balanceOf(msg.sender, positionId) != 1) revert NotPositionOwner();

        Position storage position = positions[positionId];
        if (splitPrincipalAmount == 0 || splitPrincipalAmount >= position.principalAmount) revert InvalidAmount();

        uint256 splitClaimedAmount = (position.claimedAmount * splitPrincipalAmount) / position.principalAmount;

        position.principalAmount -= splitPrincipalAmount;
        position.claimedAmount -= splitClaimedAmount;
        position.split = true;

        newPositionId = nextPositionId;
        nextPositionId++;

        positions[newPositionId] = Position({
            loanId: position.loanId,
            principalAmount: splitPrincipalAmount,
            claimedAmount: splitClaimedAmount,
            split: true
        });

        _mint(msg.sender, newPositionId, 1, "");

        emit PositionSplit(positionId, newPositionId, splitPrincipalAmount, splitClaimedAmount);
    }

    function _claimFundingPrincipal(uint256 positionId, Position storage position, Loan storage loan) private {
        if (block.timestamp >= loan.loanWithdrawFreezeDeadline) revert LoanWithdrawFreezeDeadlinePassed();
        if (balanceOf(msg.sender, positionId) != 1) revert NotPositionOwner();

        uint256 amount = position.principalAmount - position.claimedAmount;
        if (amount == 0) revert NothingToClaim();

        position.claimedAmount += amount;
        loan.fundedAmount -= amount;

        if (loan.state == LoanState.Funded) {
            loan.state = LoanState.Funding;
        }

        _burn(msg.sender, positionId, 1);

        if (!usdc.transfer(msg.sender, amount)) revert TransferFailed();

        emit Claimed(position.loanId, positionId, msg.sender, amount);
    }

    function _lenderPayoutPool(uint256 loanId, Loan storage loan) private view returns (uint256) {
        return loan.creditedAmount - _totalProtocolFee(loanId, loan);
    }

    function _totalProtocolFee(uint256 loanId, Loan storage loan) private view returns (uint256) {
        if (loan.creditedAmount <= loan.fundedAmount) {
            return 0;
        }

        uint256 profit = loan.creditedAmount - loan.fundedAmount;
        return (profit * loanFeeBps[loanId]) / 10_000;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, ERC1155Holder) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
