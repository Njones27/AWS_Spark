import { useSyncExternalStore } from 'react';

// Spark is designed for laptops and Chromebooks. Phones get their own layout, switched on by `data-device="phone"` on
// <html>, so every phone rule can be scoped under that attribute and the laptop layout never changes.

export type Device = 'phone' | 'laptop';
/** What the student picked in the menu. 'auto' follows the screen. */
export type LayoutChoice = 'auto' | Device;

/**
 * A phone is a touch screen that is narrow when upright or short when turned sideways. Tablets, touch Chromebooks
 * (whose main pointer is the trackpad) and narrow laptop windows all keep the laptop layout.
 */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 760px), (pointer: coarse) and (max-height: 500px)';

const KEY = 'spark-layout';

export function parseChoice(raw: string | null): LayoutChoice {
  return raw === 'phone' || raw === 'laptop' ? raw : 'auto';
}

export function resolveDevice(choice: LayoutChoice, phoneScreen: boolean): Device {
  if (choice !== 'auto') return choice;
  return phoneScreen ? 'phone' : 'laptop';
}

export interface DeviceInfo {
  /** The layout in use. */
  device: Device;
  /** The screen itself is a phone's, whatever layout the student picked. */
  phoneScreen: boolean;
  /** A phone layout held sideways. */
  sideways: boolean;
}

let choice: LayoutChoice = 'auto';
let info: DeviceInfo = { device: 'laptop', phoneScreen: false, sideways: false };
const listeners = new Set<() => void>();

/**
 * Whether the phone itself is turned sideways. Read from the screen, not the viewport: on Android the on-screen keyboard
 * shrinks the viewport until `(orientation: landscape)` matches on an upright phone.
 */
function screenSideways(): boolean {
  const type = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
  if (type) return type.startsWith('landscape');
  return typeof matchMedia === 'function' && matchMedia('(orientation: landscape)').matches;
}

function update() {
  const phoneScreen = typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;
  const device = resolveDevice(choice, phoneScreen);
  const sideways = device === 'phone' && screenSideways();
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.device = device;
    // The sideways phone styles hang off this attribute rather than an orientation media query (see screenSideways).
    if (sideways) root.dataset.sideways = '';
    else delete root.dataset.sideways;
  }
  if (device === info.device && phoneScreen === info.phoneScreen && sideways === info.sideways) return;
  info = { device, phoneScreen, sideways };
  listeners.forEach((l) => l());
}

/** Read the saved choice, tag <html>, and follow rotation and resizes. Call once at start-up. */
export function startDeviceWatch() {
  try {
    choice = parseChoice(localStorage.getItem(KEY));
  } catch {
    // Storage is blocked, so follow the screen.
  }
  update();
  matchMedia(PHONE_QUERY).addEventListener('change', update);
  if (typeof screen !== 'undefined' && screen.orientation) screen.orientation.addEventListener('change', update);
  else matchMedia('(orientation: landscape)').addEventListener('change', update);
}

export function setLayoutChoice(next: LayoutChoice) {
  choice = next;
  try {
    if (next === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not saved; the choice still lasts until the tab closes.
  }
  update();
}

export function useDevice(): DeviceInfo {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => info,
  );
}
