import { Capacitor } from '@capacitor/core';

/** Input types that do not bring up the on-screen keyboard (iOS shows a picker or nothing). */
const NO_KEYBOARD = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image', 'hidden', 'date', 'time', 'datetime-local', 'month', 'week']);

/** The keyboard is taken as open when the visual viewport is this much shorter than the layout viewport. */
const KEYBOARD_MIN_PX = 120;

function isTextField(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !el.readOnly && !el.disabled && !NO_KEYBOARD.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * iOS app only. Without the Keyboard plugin the WebView does not shrink when the on-screen
 * keyboard opens, so the fixed tab bars and sticky action bars float over the keyboard and
 * cover the field being typed in. While a text field has focus, `kb-open` is set on <html>
 * and src/index.css hides those bars ([data-tabbar], [data-booking-bar], [data-save-bar],
 * [data-cookie-notice]).
 * The visual viewport is watched as well, so the bars come back when the keyboard is swiped
 * away or the focused field is removed without a blur event. On an iPad a hardware keyboard
 * may be attached, so there the bars are hidden only once the visual viewport shows that the
 * on-screen keyboard is really up. Does nothing on the website or on Android.
 */
export function initKeyboardBars(): void {
  if (Capacitor.getPlatform() !== 'ios') return;
  const root = document.documentElement;
  const vv = window.visualViewport;
  let timer: number | undefined;
  // A phone always brings up the on-screen keyboard for a text field.
  const phone = Math.min(window.screen.width, window.screen.height) < 600;
  const keyboardUp = () => !!vv && vv.height * vv.scale < root.clientHeight - KEYBOARD_MIN_PX;

  const check = (delay: number) => {
    window.clearTimeout(timer);
    // Moving focus from one field to the next fires focusout before focusin; waiting a moment
    // keeps the bars from flickering in between.
    timer = window.setTimeout(() => {
      if (!isTextField(document.activeElement)) root.classList.remove('kb-open');
    }, delay);
  };

  document.addEventListener('focusin', (e) => {
    window.clearTimeout(timer);
    if (isTextField(e.target as Element | null) && (phone || keyboardUp())) root.classList.add('kb-open');
  });
  document.addEventListener('focusout', () => check(80));
  // A tap elsewhere may close the keyboard without moving focus to another field.
  document.addEventListener('pointerdown', () => check(400), { passive: true });

  if (!vv) return;
  let sawKeyboard = false;
  vv.addEventListener('resize', () => {
    if (keyboardUp()) {
      sawKeyboard = true;
      if (isTextField(document.activeElement)) root.classList.add('kb-open');
    } else if (sawKeyboard) {
      sawKeyboard = false;
      root.classList.remove('kb-open');
    }
  });
}
