import { createContext, useContext } from 'react';

/** Every color the UI uses. Components read these instead of hard-coding hex values. */
export interface Theme {
  dark: boolean;
  bg: string; // screen background
  surface: string; // cards, sheets, inputs
  surfaceAlt: string; // table headers, totals, subtle fills
  border: string;
  borderStrong: string; // input outlines
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string; // main action / selected state
  onPrimary: string;
  primarySoft: string; // tinted background for selected things
  link: string;
  green: string; // money in (text)
  red: string; // money out (text)
  greenStrong: string; // filled buttons
  redStrong: string;
  greenSoft: string;
  redSoft: string;
  amber: string; // installments, warnings
  amberSoft: string;
  pendingSoft: string; // very light orange, pending rows
  focusBg: string; // focused input background
  overlay: string; // popup backdrop
}

export const lightTheme: Theme = {
  dark: false,
  bg: '#f4f6fb',
  surface: '#ffffff',
  surfaceAlt: '#eef1f8',
  border: '#e4e8f1',
  borderStrong: '#c3cbdc',
  text: '#0f172a',
  textMuted: '#5b6578',
  textFaint: '#97a0b2',
  primary: '#4f46e5',
  onPrimary: '#ffffff',
  primarySoft: '#eceeff',
  link: '#4f46e5',
  green: '#15803d',
  red: '#dc2626',
  greenStrong: '#16a34a',
  redStrong: '#dc2626',
  greenSoft: '#e6f6ec',
  redSoft: '#fdeaea',
  amber: '#b45309',
  amberSoft: '#fffbeb',
  pendingSoft: '#fff3e2',
  focusBg: '#f5f6ff',
  overlay: 'rgba(15,23,42,0.5)',
};

export const darkTheme: Theme = {
  dark: true,
  bg: '#0a0f1e',
  surface: '#121a30',
  surfaceAlt: '#1a2442',
  border: '#222e4d',
  borderStrong: '#38476b',
  text: '#e8ecf6',
  textMuted: '#9aa6c0',
  textFaint: '#65718d',
  primary: '#6366f1',
  onPrimary: '#ffffff',
  primarySoft: '#1e2450',
  link: '#8b93ff',
  green: '#4ade80',
  red: '#f87171',
  greenStrong: '#16a34a',
  redStrong: '#dc2626',
  greenSoft: '#12301f',
  redSoft: '#3a1519',
  amber: '#fbbf24',
  amberSoft: '#2a2208',
  pendingSoft: '#33230d',
  focusBg: '#17214a',
  overlay: 'rgba(0,0,0,0.65)',
};

export const ThemeContext = createContext<Theme>(lightTheme);
export const useTheme = () => useContext(ThemeContext);
