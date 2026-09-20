import React, { memo, useState, useRef, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import type { Transaction, Account, Category } from '@/db/schema';

// Native iOS System Colors
const IOS_COLORS = {
  blue: '#007AFF',
  red: '#FF3B30',
  green: '#34C759',
};

const DELETE_ACTION_WIDTH = 76;

export interface DayGroupProps {
  groupTitle: string;
  totalIncome: number;
  totalExpense: number;
  netCents: number;
  transactions: Transaction[];
  accounts?: Account[];
  categories?: Category[];
  format?: (cents: number) => string;
  getCategoryName?: (tx: Transaction) => string;
  onDeleteTx?: (id: string) => void;
  onEditTx?: (tx: Transaction) => void;
}

const defaultFormat = (cents: number): string => {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
};

const parseGroupTitle = (title: string) => {
  const cleanTitle = title.trim();
  const match = cleanTitle.match(/^(\d{1,2})\s+([A-Za-z]+)$/);

  if (match) {
    return { dayNum: match[1].padStart(2, '0'), dayLabel: match[2] };
  }
  return { dayNum: null, dayLabel: cleanTitle };
};

const parseCategories = (tx: Transaction, fallbackCategoryName: string) => {
  if (tx.type === 'transfer') {
    return { parentCategory: 'Transfer', childCategory: '' };
  }

  const delimiter = ['/', '>', ':', '|'].find((d) => fallbackCategoryName.includes(d));
  if (delimiter) {
    const parts = fallbackCategoryName.split(delimiter);
    return {
      parentCategory: parts[0].trim(),
      childCategory: parts.slice(1).join(delimiter).trim(),
    };
  }

  return { parentCategory: fallbackCategoryName, childCategory: '' };
};

const formatAccountLabel = (tx: Transaction, account?: Account, toAccount?: Account | null) => {
  const accountName =
    tx.type === 'transfer' && account && toAccount
      ? `${account.name} ➔ ${toAccount.name}`
      : account?.name || 'Unknown Account';

  return tx.isRecurring ? `${accountName} (${tx.repeatInterval || 'Every Month'})` : accountName;
};

/**
 * Single Transaction Row
 */
const TransactionRowItem = memo(({
  tx,
  accountsMap,
  getCategoryName,
  format = defaultFormat,
  onDeleteTx,
  onEditTx,
  isLast = false,
}: {
  tx: Transaction;
  accountsMap?: Map<string, Account>;
  getCategoryName?: (tx: Transaction) => string;
  format?: (cents: number) => string;
  onDeleteTx?: (id: string) => void;
  onEditTx?: (tx: Transaction) => void;
  isLast?: boolean;
}) => {
  const theme = useTheme();

  const [translateX, setTranslateX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartXRef = useRef<number | null>(null);
  const currentTranslateRef = useRef<number>(0);
  const currentDragXRef = useRef<number>(0); // Tracks live drag position to prevent race conditions

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onDeleteTx) return;
    touchStartXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || !onDeleteTx) return;

    const currentX = e.touches[0].clientX;
    const diffX = currentX - touchStartXRef.current;
    const baseOffset = currentTranslateRef.current < 0 ? -DELETE_ACTION_WIDTH : 0;

    const newOffset = Math.min(0, Math.max(-DELETE_ACTION_WIDTH - 20, baseOffset + diffX));
    setTranslateX(newOffset);
    currentDragXRef.current = newOffset;
  };

  const handleTouchEnd = () => {
    if (!onDeleteTx) return;

    setIsDragging(false);
    touchStartXRef.current = null;

    // Evaluate the ref instead of state to avoid async state batching issues
    if (currentDragXRef.current < -DELETE_ACTION_WIDTH / 2) {
      setTranslateX(-DELETE_ACTION_WIDTH);
      currentTranslateRef.current = -DELETE_ACTION_WIDTH;
    } else {
      setTranslateX(0);
      currentTranslateRef.current = 0;
    }
  };

  const handleRowClick = () => {
    if (translateX < 0) {
      setTranslateX(0);
      currentTranslateRef.current = 0;
      return;
    }
    onEditTx?.(tx);
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRowClick();
    }
  };

  // Safely handle optional accountId / toAccountId from the schema
  const account = tx.accountId ? accountsMap?.get(tx.accountId) : undefined;
  const toAccount = tx.toAccountId ? accountsMap?.get(tx.toAccountId) : undefined;
  const categoryName = getCategoryName ? getCategoryName(tx) : 'Uncategorized';

  const { parentCategory, childCategory } = parseCategories(tx, categoryName);
  const accountFormatted = formatAccountLabel(tx, account, toAccount);

  const amountColor =
    tx.type === 'income'
      ? IOS_COLORS.green
      : tx.type === 'expense'
      ? IOS_COLORS.red
      : theme.palette.text.primary;

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', width: '100%' }}>
      {/* Revealed Delete Action */}
      {onDeleteTx && (
        <Box
          onClick={(e) => {
            e.stopPropagation();
            onDeleteTx(tx.id);
            setTranslateX(0);
            currentTranslateRef.current = 0;
          }}
          role="button"
          tabIndex={0}
          aria-label={`Delete transaction ${tx.note || parentCategory}`}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: DELETE_ACTION_WIDTH,
            bgcolor: IOS_COLORS.red,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 1,
            userSelect: 'none',
            '&:active': { filter: 'brightness(0.9)' },
          }}
        >
          <Trash2 size={20} color="#ffffff" aria-hidden />
        </Box>
      )}

      {/* Row Foreground Grid */}
      <Box
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Transaction: ${parentCategory}. Amount: ${format(tx.amount)}`}
        sx={{
          position: 'relative' as const,
          zIndex: 2,
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'grid',
          gridTemplateColumns: '120px 1fr 90px',
          alignItems: 'center',
          columnGap: 1.5,
          px: 2,
          py: 1.25,
          minHeight: 52,
          bgcolor: 'background.paper',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
          cursor: 'pointer',
          userSelect: 'none',
          outline: 'none',

          // Inset Divider Line
          ...(!isLast && {
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: 0,
              left: 16,
              right: 0,
              height: '1px',
              backgroundColor: alpha(theme.palette.divider, 0.3),
            },
          }),
          '&:active': {
            bgcolor: (t) => alpha(t.palette.action.active, 0.05),
          },
          '&:focus-visible': {
            boxShadow: `inset 0 0 0 2px ${IOS_COLORS.blue}`,
          },
        }}
      >
        {/* Column 1: Category */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography
            noWrap
            sx={{
              fontWeight: 600,
              fontSize: '0.8125rem',
              lineHeight: 1.3,
              color: 'text.primary',
              letterSpacing: '-0.005em',
            }}
          >
            {parentCategory}
          </Typography>

          {childCategory ? (
            <Typography
              noWrap
              sx={{
                fontWeight: 400,
                fontSize: '0.75rem',
                lineHeight: 1.2,
                color: 'text.secondary',
                mt: 0.2,
              }}
            >
              {childCategory}
            </Typography>
          ) : null}
        </Box>

        {/* Column 2: Note & Account */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {tx.note ? (
            <>
              <Typography
                noWrap
                sx={{
                  fontWeight: 400,
                  fontSize: '0.8125rem',
                  lineHeight: 1.3,
                  color: 'text.primary',
                  letterSpacing: '-0.01em',
                }}
              >
                {tx.note}
              </Typography>
              <Typography
                noWrap
                sx={{
                  fontWeight: 400,
                  fontSize: '0.75rem',
                  lineHeight: 1.2,
                  color: 'text.secondary',
                  mt: 0.2,
                }}
              >
                {accountFormatted}
              </Typography>
            </>
          ) : (
            <Typography
              noWrap
              sx={{
                fontWeight: 400,
                fontSize: '0.8125rem',
                lineHeight: 1.3,
                color: 'text.secondary',
                letterSpacing: '-0.01em',
              }}
            >
              {accountFormatted}
            </Typography>
          )}
        </Box>

        {/* Column 3: Amount */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
          <Typography
            noWrap
            sx={{
              fontWeight: 600,
              fontSize: '0.9375rem',
              color: amountColor,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'right',
              letterSpacing: '-0.01em',
            }}
          >
            {format(tx.amount)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
});

/**
 * Unified Container Box: Holds Header and all Transactions for one Day
 */
export const DayGroupCard: React.FC<DayGroupProps> = memo(({
  groupTitle,
  totalIncome,
  totalExpense,
  netCents,
  transactions = [],
  accounts = [],
  format = defaultFormat,
  getCategoryName,
  onDeleteTx,
  onEditTx,
}) => {
  const isNetPositive = netCents >= 0;
  const { dayNum, dayLabel } = parseGroupTitle(groupTitle);

  // Create a Map for O(1) account lookups instead of O(N) array.find() per row
  const accountsMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  return (
    <Box
      sx={{
        mt: 2,
        mb: 2,
        borderRadius: '16px',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: (t) => alpha(t.palette.divider, 0.2),
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
      }}
    >
      {/* 1. Header Section */}
      <Box
        sx={{
          p: 2,
          bgcolor: (t) =>
            t.palette.mode === 'dark'
              ? alpha('#1E293B', 0.4)
              : alpha('#F8FAFC', 0.8),
          borderBottom: '1px solid',
          borderColor: (t) => alpha(t.palette.divider, 0.25),
        }}
      >
        {/* Date Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
          {dayNum ? (
            <>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  color: 'text.primary',
                  letterSpacing: '-0.02em',
                }}
              >
                {dayNum}
              </Typography>
              <Box
                sx={{
                  px: 1,
                  py: 0.3,
                  borderRadius: '6px',
                  bgcolor: (t) =>
                    t.palette.mode === 'dark'
                      ? alpha('#9CA3AF', 0.2)
                      : alpha('#9CA3AF', 0.15),
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    color: 'text.secondary',
                    textTransform: 'capitalize',
                  }}
                >
                  {dayLabel}
                </Typography>
              </Box>
            </>
          ) : (
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: '1rem',
                color: 'text.primary',
                letterSpacing: '-0.01em',
              }}
            >
              {groupTitle}
            </Typography>
          )}
        </Box>

        {/* Totals Bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <TrendingUp size={15} color={IOS_COLORS.blue} aria-hidden />
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: IOS_COLORS.blue,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                +{format(totalIncome)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <TrendingDown size={15} color={IOS_COLORS.red} aria-hidden />
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: IOS_COLORS.red,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                -{format(totalExpense)}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              px: 1.25,
              py: 0.4,
              borderRadius: '8px',
              bgcolor: alpha(isNetPositive ? IOS_COLORS.blue : IOS_COLORS.red, 0.18),
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: '0.875rem',
                color: isNetPositive ? IOS_COLORS.blue : IOS_COLORS.red,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isNetPositive ? '+' : ''}
              {format(netCents)}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 2. Transaction Rows List */}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {transactions.map((tx, idx) => (
          <TransactionRowItem
            key={tx.id || idx}
            tx={tx}
            accountsMap={accountsMap}
            getCategoryName={getCategoryName}
            format={format}
            onDeleteTx={onDeleteTx} // Pass raw function, preserve memo
            onEditTx={onEditTx}     // Pass raw function, preserve memo
            isLast={idx === transactions.length - 1}
          />
        ))}
      </Box>
    </Box>
  );
});

DayGroupCard.displayName = 'DayGroupCard';

export default DayGroupCard;