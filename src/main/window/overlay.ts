import { app, BrowserWindow, globalShortcut, screen } from 'electron';
import path from 'node:path';
import { InputFocus } from '../input/focus';
import { loadRenderer, preloadPath } from './renderer';
import { resetPanelHitTest } from '../ipc/overlay';

let overlayWindow: BrowserWindow | null = null;
export const inputFocus = new InputFocus(path.join(app.getPath('userData'), 'focus'), process.pid);
app.on('before-quit', () => inputFocus.stop());
export const getOverlayWindow = () => overlayWindow;
/** Keyboard controls: the overlay takes focus so Tab reaches the bubble and cards; Esc hands focus back. */
const KEYBOARD_CONTROLS_SHORTCUT = 'CommandOrControl+Alt+K';
let keyboardShortcutActive = false;
let focusGeneration = 0;
export async function focusOverlayControls() {
  const win = overlayWindow; if (!win || win.isDestroyed()) return;
  win.webContents.send('app:event', { type: 'conversation:show' });
  if (win.isFocused()) return;
  const generation = ++focusGeneration;
  await inputFocus.remember();
  if (generation !== focusGeneration || win.isDestroyed()) return;
  win.setFocusable(true); win.focus();
}
export function registerKeyboardControlsShortcut() {
  keyboardShortcutActive = globalShortcut.register(KEYBOARD_CONTROLS_SHORTCUT, focusOverlayControls);
  return keyboardShortcutActive;
}
/** The accelerator to show in menus, only when registering it succeeded (another app may own it). */
export const keyboardControlsShortcut = () => keyboardShortcutActive ? KEYBOARD_CONTROLS_SHORTCUT : undefined;
// Blurring returns focus to the app underneath; the window's blur handler makes it unfocusable again.
export async function releaseOverlayControls() {
  const generation = ++focusGeneration;
  const win = overlayWindow; if (!win?.isFocused()) return;
  const restored = await inputFocus.restore();
  if (generation !== focusGeneration) return;
  if (!win.isDestroyed()) { if (!restored && win.isFocused()) win.blur(); win.setFocusable(false); }
}
export function getDesktopBounds() {
  const displays = screen.getAllDisplays().map(display => display.bounds);
  const x = Math.min(...displays.map(bounds => bounds.x));
  const y = Math.min(...displays.map(bounds => bounds.y));
  return {
    x, y,
    width: Math.max(...displays.map(bounds => bounds.x + bounds.width)) - x,
    height: Math.max(...displays.map(bounds => bounds.y + bounds.height)) - y,
  };
}
export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow) return overlayWindow;
  void inputFocus.warm();
  const win = new BrowserWindow({
    ...getDesktopBounds(), transparent: true, frame: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, hasShadow: false, focusable: false, enableLargerThanScreen: true,
    show: false, backgroundColor: '#00000000',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  overlayWindow = win;
  win.on('blur', () => win.setFocusable(false));
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => {
    win.showInactive();
    // Windows can constrain the initial window to the work area (excluding taskbar).
    win.setBounds(getDesktopBounds());
  });
  const updateBounds = () => win.setBounds(getDesktopBounds());
  screen.on('display-added', updateBounds);
  screen.on('display-removed', updateBounds);
  screen.on('display-metrics-changed', updateBounds);
  win.webContents.on('did-start-loading', () => {
    resetPanelHitTest();
    win.setIgnoreMouseEvents(true, { forward: true });
  });
  win.on('closed', () => {
    screen.removeListener('display-added', updateBounds);
    screen.removeListener('display-removed', updateBounds);
    screen.removeListener('display-metrics-changed', updateBounds);
    overlayWindow = null;
  });
  void loadRenderer(win, 'overlay');
  return win;
}
