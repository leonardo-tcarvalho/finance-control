import { createContext, useContext } from 'react';

/** Every color the UI uses. Components read these instead of hard-coding hex values. */
export interface Theme {
  dark: boolean;
  bg: string; // screen background
  surface: string; // cards, sheets, inputs
  surfaceAlt: string; // table headers, totals, subtle fills
  zebra: string; // alternate row
  border: string;
  borderStrong: string; // input outlines
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string; // main action / selected state
  onPrimary: string;
  link: string;
  green: string; // money in (text)
  red: string; // money out (text)
  greenStrong: string; // filled buttons
  redStrong: string;
  amber: string; // installments, warnings
  amberSoft: string;
  focusBg: string; // focused input background
  overlay: string; // popup backdrop
}

export const lightTheme: Theme = {
  dark: false,
  bg: '#eef2f7',
  surface: '#ffffff',
  surfaceAlt: '#e2e8f0',
  zebra: '#f8fafc',
  border: '#cbd5e1',
  borderStrong: '#94a3b8',
  text: '#0f172a',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  primary: '#0f172a',
  onPrimary: '#ffffff',
  link: '#2563eb',
  green: '#15803d',
  red: '#b91c1c',
  greenStrong: '#15803d',
  redStrong: '#b91c1c',
  amber: '#b45309',
  amberSoft: '#fffbeb',
  focusBg: '#f8fbff',
  overlay: 'rgba(15,23,42,0.55)',
};

export const darkTheme: Theme = {
  dark: true,
  bg: '#0b1120',
  surface: '#121a2c',
  surfaceAlt: '#1b2740',
  zebra: '#0f1626',
  border: '#26334f',
  borderStrong: '#3b4a6b',
  text: '#e6ebf5',
  textMuted: '#9aa7bf',
  textFaint: '#66748f',
  primary: '#e6ebf5',
  onPrimary: '#0b1120',
  link: '#60a5fa',
  green: '#4ade80',
  red: '#f87171',
  greenStrong: '#16a34a',
  redStrong: '#dc2626',
  amber: '#fbbf24',
  amberSoft: '#2a2208',
  focusBg: '#16223a',
  overlay: 'rgba(0,0,0,0.65)',
};

export const ThemeContext = createContext<Theme>(lightTheme);
export const useTheme = () => useContext(ThemeContext);
