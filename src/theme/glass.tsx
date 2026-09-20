// src/theme/glass.ts
// Shared iOS "Liquid Glass" design tokens. Keep this file dependency-light —
// it must stay importable from anywhere (including tabs that Dashboard
// imports) without creating circular imports.
import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import type { FC } from 'react';

export const iOSFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Helvetica, Arial, sans-serif',
};

/**
 * iOS "Liquid Glass" panel style — frosted, translucent, with a specular
 * top highlight and a soft ambient shadow.
 */
export const glassSx = (t: Theme, opacity = 0.6) => {
  const isLight = t.palette.mode === 'light';
  return {
    bgcolor: alpha(t.palette.background.paper, isLight ? opacity : opacity + 0.15),
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: `1px solid ${isLight ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.1)'}`,
    boxShadow: isLight
      ? '0 12px 40px -8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
      : '0 12px 40px -8px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  };
};

/** Ambient colour orbs that sit behind everything so the glass has something to blur. */
export const AmbientBackground: FC = () => (
  <Box
    aria-hidden
    sx={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}
  >
    <Box
      sx={{
        position: 'absolute',
        top: '-20%',
        left: '-12%',
        width: '55vmax',
        height: '55vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 122, 255, 0.20) 0%, transparent 65%)',
      }}
    />
    <Box
      sx={{
        position: 'absolute',
        bottom: '5%',
        right: '-18%',
        width: '50vmax',
        height: '50vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(175, 82, 222, 0.16) 0%, transparent 65%)',
      }}
    />
    <Box
      sx={{
        position: 'absolute',
        top: '30%',
        right: '15%',
        width: '35vmax',
        height: '35vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(52, 199, 89, 0.13) 0%, transparent 65%)',
      }}
    />
    <Box
      sx={{
        position: 'absolute',
        bottom: '-15%',
        left: '10%',
        width: '40vmax',
        height: '40vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 149, 0, 0.10) 0%, transparent 65%)',
      }}
    />
  </Box>
);