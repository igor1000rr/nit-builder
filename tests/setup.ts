/**
 * Глобальный setup для всех vitest прогонов.
 *
 * - jest-dom matchers (toBeInTheDocument, toHaveTextContent и т.п.) —
 *   подключаются глобально, не нужно импортировать в каждом UI-тесте.
 * - Очистка DOM между тестами — RTL делает это сам через `cleanup()`,
 *   но мы явно регистрируем afterEach чтобы было понятно.
 * - Мок для `window.matchMedia` — некоторые компоненты Tailwind/анимаций
 *   обращаются к нему при mount, jsdom не имплементирует.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom не имплементирует matchMedia. Без mock'а компоненты с
// `window.matchMedia(...)` падают на mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  // Определяем как writable=true чтобы тесты могли переопределить при нужде.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
